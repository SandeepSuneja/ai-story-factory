"""Train a lightweight SDXL LoRA from a single approved character portrait."""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from pathlib import Path

import torch
from diffusers import DDPMScheduler, StableDiffusionXLPipeline
from diffusers.optimization import get_scheduler
from peft import LoraConfig
from peft.utils import get_peft_model_state_dict
from PIL import Image, ImageEnhance
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

logger = logging.getLogger(__name__)


def appearance_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def augment_portrait(source: Image.Image, index: int) -> Image.Image:
    image = source.convert("RGB")
    if index % 2 == 1:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    width, height = image.size
    crop_scale = 0.88 + (index % 3) * 0.04
    crop_w = max(64, int(width * crop_scale))
    crop_h = max(64, int(height * crop_scale))
    left = (width - crop_w) // 2
    top = (height - crop_h) // 2
    image = image.crop((left, top, left + crop_w, top + crop_h))

    if index % 4 == 2:
        image = ImageEnhance.Brightness(image).enhance(1.06)
    if index % 4 == 3:
        image = ImageEnhance.Contrast(image).enhance(1.05)

    return image


class PortraitDataset(Dataset):
    def __init__(self, images: list[Image.Image], instance_prompt: str, resolution: int) -> None:
        self.images = images
        self.prompt = instance_prompt
        self.transform = transforms.Compose(
            [
                transforms.Resize(resolution, interpolation=transforms.InterpolationMode.BILINEAR),
                transforms.CenterCrop(resolution),
                transforms.ToTensor(),
                transforms.Normalize([0.5], [0.5]),
            ]
        )

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor | str]:
        tensor = self.transform(self.images[index])
        return {"pixel_values": tensor, "prompt": self.prompt}


def build_training_images(portrait_path: Path, count: int = 8) -> list[Image.Image]:
    with Image.open(portrait_path) as source:
        base = source.convert("RGB")
    return [augment_portrait(base, index) for index in range(count)]


def _time_ids(pipe: StableDiffusionXLPipeline, device: str, dtype: torch.dtype, resolution: int) -> torch.Tensor:
    original_size = (resolution, resolution)
    target_size = (resolution, resolution)
    crops_coords_top_left = (0, 0)
    add_time_ids = list(original_size + crops_coords_top_left + target_size)
    return torch.tensor([add_time_ids], dtype=dtype, device=device)


def train_character_lora(
    *,
    model_id: str,
    portrait_path: Path,
    output_path: Path,
    meta_path: Path,
    character_id: str,
    instance_prompt: str,
    appearance: str,
    train_resolution: int,
    train_steps: int,
    train_rank: int,
    train_lr: float,
    default_scale: float,
    device: str = "cuda",
) -> dict[str, str | int | float]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    work_dir = output_path.parent / f".train-{character_id}-{appearance_hash(appearance)}"
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    dtype = torch.float16 if device == "cuda" else torch.float32
    pipe = StableDiffusionXLPipeline.from_pretrained(
        model_id,
        torch_dtype=dtype,
        use_safetensors=True,
    )
    pipe.scheduler = DDPMScheduler.from_config(pipe.scheduler.config)
    # Training needs the UNet resident for gradients — do not use model CPU offload.
    pipe.vae.enable_slicing()
    if device == "cuda":
        pipe.to("cuda")
    elif device == "mps":
        pipe.to("mps")
    else:
        pipe.to("cpu")
        pipe.enable_attention_slicing()
        logger.warning(
            "Training LoRA on CPU; this will be slow. Install a CUDA torch build for GPU training."
        )

    images = build_training_images(portrait_path)
    dataset = PortraitDataset(images, instance_prompt, train_resolution)
    loader = DataLoader(dataset, batch_size=1, shuffle=True)

    pipe.unet.requires_grad_(False)
    pipe.text_encoder.requires_grad_(False)
    pipe.text_encoder_2.requires_grad_(False)

    lora_config = LoraConfig(
        r=train_rank,
        lora_alpha=train_rank,
        init_lora_weights="gaussian",
        target_modules=["to_k", "to_q", "to_v", "to_out.0"],
    )
    pipe.unet.add_adapter(lora_config)

    params = [param for param in pipe.unet.parameters() if param.requires_grad]
    # Keep LoRA weights in fp32 — full fp16 training collapses to NaN on SDXL.
    for param in params:
        param.data = param.data.float()
        if param.grad is not None:
            param.grad = param.grad.float()
    optimizer = torch.optim.AdamW(params, lr=train_lr)
    lr_scheduler = get_scheduler(
        "cosine",
        optimizer=optimizer,
        num_warmup_steps=min(40, train_steps // 10),
        num_training_steps=train_steps,
    )
    use_amp = device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    logger.info(
        "Training LoRA for %s (%s steps, rank=%s, resolution=%s, device=%s)",
        character_id,
        train_steps,
        train_rank,
        train_resolution,
        device,
    )

    step = 0
    pipe.unet.train()
    while step < train_steps:
        for batch in loader:
            if step >= train_steps:
                break

            pixel_values = batch["pixel_values"].to(device=device, dtype=dtype)
            prompt = batch["prompt"]
            if isinstance(prompt, list):
                prompt = prompt[0]

            with torch.no_grad():
                prompt_embeds, _, pooled_prompt_embeds, _ = pipe.encode_prompt(
                    prompt=prompt,
                    prompt_2=prompt,
                    device=device,
                    num_images_per_prompt=1,
                    do_classifier_free_guidance=False,
                )
                # VAE encode in fp32 for numerical stability.
                vae_dtype = next(pipe.vae.parameters()).dtype
                latents = pipe.vae.encode(pixel_values.to(dtype=vae_dtype)).latent_dist.sample()
                latents = latents * pipe.vae.config.scaling_factor
                latents = latents.to(dtype=dtype)

            noise = torch.randn_like(latents)
            timesteps = torch.randint(
                0,
                pipe.scheduler.config.num_train_timesteps,
                (latents.shape[0],),
                device=device,
            ).long()
            noisy_latents = pipe.scheduler.add_noise(latents, noise, timesteps)
            time_ids = _time_ids(pipe, device, dtype, train_resolution)

            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                model_pred = pipe.unet(
                    noisy_latents,
                    timesteps,
                    encoder_hidden_states=prompt_embeds,
                    added_cond_kwargs={
                        "text_embeds": pooled_prompt_embeds,
                        "time_ids": time_ids,
                    },
                ).sample
                loss = torch.nn.functional.mse_loss(model_pred.float(), noise.float())

            if not torch.isfinite(loss):
                raise RuntimeError(
                    f"LoRA training produced non-finite loss at step {step + 1} "
                    f"for {character_id} (loss={loss.item()})"
                )

            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            lr_scheduler.step()
            optimizer.zero_grad(set_to_none=True)
            step += 1

            if step % 50 == 0:
                logger.info(
                    "LoRA train %s step %s/%s loss=%.4f",
                    character_id,
                    step,
                    train_steps,
                    loss.item(),
                )

    lora_state_dict = get_peft_model_state_dict(pipe.unet)
    StableDiffusionXLPipeline.save_lora_weights(
        str(output_path.parent),
        lora_state_dict,
        weight_name=output_path.name,
        safe_serialization=True,
    )

    meta = {
        "characterId": character_id,
        "appearanceHash": appearance_hash(appearance),
        "instancePrompt": instance_prompt,
        "trainSteps": train_steps,
        "rank": train_rank,
        "defaultScale": default_scale,
        "modelId": model_id,
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    shutil.rmtree(work_dir, ignore_errors=True)

    del pipe
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return meta
