import type {
  AnimationStyle,
  SeriesOrientation,
  SeriesVisualStyle,
} from "./content-state";

export function createDefaultVisualStyle(): SeriesVisualStyle {
  return {
    orientation: "landscape",
    animationStyle: "2d",
    framing:
      "Eye-level cinematic framing, consistent left-to-right scene blocking, stable camera height across episodes",
    colorPalette: "Warm natural tones with soft contrast",
    artDirection:
      "2D animated short-form storytelling with cohesive lighting and expressive motion",
  };
}

export function mergeVisualStyle(
  partial?: Partial<SeriesVisualStyle>,
): SeriesVisualStyle {
  const defaults = createDefaultVisualStyle();
  if (!partial) {
    return defaults;
  }

  const animationStyle = partial.animationStyle ?? defaults.animationStyle;
  const rawArtDirection =
    partial.artDirection?.trim() ||
    defaultArtDirectionForAnimation(animationStyle);

  return {
    orientation: partial.orientation ?? defaults.orientation,
    animationStyle,
    framing: partial.framing?.trim() || defaults.framing,
    colorPalette: partial.colorPalette?.trim() || defaults.colorPalette,
    artDirection: normalizeArtDirection(animationStyle, rawArtDirection),
  };
}

function normalizeArtDirection(
  animationStyle: AnimationStyle,
  artDirection: string,
): string {
  const lower = artDirection.toLowerCase();
  const looksPhotoreal =
    /\b(photoreal|photo-real|live.action|photograph|realistic short-form)\b/i.test(
      lower,
    );
  const looks2d =
    /\b(2d|cel-shaded|flat illustration|cartoon illustration|line art)\b/i.test(
      lower,
    );

  if (animationStyle === "2d" && looksPhotoreal) {
    return defaultArtDirectionForAnimation("2d");
  }
  if (animationStyle === "3d" && looks2d && !looksPhotoreal) {
    return defaultArtDirectionForAnimation("3d");
  }

  return artDirection;
}

export function defaultArtDirectionForAnimation(
  animationStyle: AnimationStyle,
): string {
  if (animationStyle === "3d") {
    return "3D animated CGI with stylized cartoon rendering, soft global illumination, and cohesive episode lighting";
  }

  return "2D animated illustration with cel-shaded colors, clean line art, and cohesive episode lighting";
}

export function getGenerationDimensions(
  orientation: SeriesOrientation = "landscape",
): { width: number; height: number } {
  if (orientation === "portrait") {
    return { width: 480, height: 832 };
  }

  return { width: 832, height: 480 };
}

export function getUpscaleDimensions(
  orientation: SeriesOrientation = "landscape",
): { width: number; height: number } {
  if (orientation === "portrait") {
    return { width: 1080, height: 1920 };
  }

  return { width: 1920, height: 1080 };
}

export function animationStyleLabel(animationStyle: AnimationStyle): string {
  return animationStyle === "3d" ? "3D animated" : "2D animated";
}

export function imagePromptAnimationSuffix(
  animationStyle: AnimationStyle = "2d",
): string {
  if (animationStyle === "3d") {
    return "3D animated CGI, stylized cartoon rendering, soft global illumination, vibrant colors.";
  }

  return "2D animated illustration, cel-shaded flat colors, clean line art, expressive cartoon style.";
}

/** Compact locked prefix reused on every scene prompt for episodic consistency. */
export function buildCompactSeriesStyleLock(
  visualStyle?: Partial<SeriesVisualStyle>,
): string {
  const style = mergeVisualStyle(visualStyle);
  const palette =
    style.colorPalette.split(/[,;]/)[0]?.trim() || "Warm natural tones";
  const animationLabel =
    style.animationStyle === "3d" ? "3D cel animation" : "2D cel-shaded animation";

  return `${palette}, ${animationLabel}, consistent episode look`;
}
