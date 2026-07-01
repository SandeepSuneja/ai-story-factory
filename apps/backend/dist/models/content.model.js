"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssembleVideoResponseDto = exports.AssembleVideoRequestDto = exports.GenerateAudioResponseDto = exports.GenerateAudioRequestDto = exports.GenerateVideoResponseDto = exports.GenerateVideoRequestDto = exports.GenerateImageResponseDto = exports.GenerateImageRequestDto = exports.GeneratePromptResponseDto = exports.GeneratePromptRequestDto = exports.GenerateCharacterProfileResponseDto = exports.GenerateCharacterProfileRequestDto = exports.GenerateScriptResponseDto = exports.GenerateScriptRequestDto = exports.GenerateStoryResponseDto = exports.GenerateStoryRequestDto = exports.GenerateIdeaResponseDto = exports.GenerateIdeaRequestDto = void 0;
class GenerateIdeaRequestDto {
    topic;
}
exports.GenerateIdeaRequestDto = GenerateIdeaRequestDto;
class GenerateIdeaResponseDto {
    idea;
}
exports.GenerateIdeaResponseDto = GenerateIdeaResponseDto;
class GenerateStoryRequestDto {
    idea;
}
exports.GenerateStoryRequestDto = GenerateStoryRequestDto;
class GenerateStoryResponseDto {
    story;
}
exports.GenerateStoryResponseDto = GenerateStoryResponseDto;
class GenerateScriptRequestDto {
    story;
}
exports.GenerateScriptRequestDto = GenerateScriptRequestDto;
class GenerateScriptResponseDto {
    script;
}
exports.GenerateScriptResponseDto = GenerateScriptResponseDto;
class GenerateCharacterProfileRequestDto {
    story;
    script;
}
exports.GenerateCharacterProfileRequestDto = GenerateCharacterProfileRequestDto;
class GenerateCharacterProfileResponseDto {
    characterAppearance;
}
exports.GenerateCharacterProfileResponseDto = GenerateCharacterProfileResponseDto;
class GeneratePromptRequestDto {
    scene;
    characterAppearance;
}
exports.GeneratePromptRequestDto = GeneratePromptRequestDto;
class GeneratePromptResponseDto {
    scene;
}
exports.GeneratePromptResponseDto = GeneratePromptResponseDto;
class GenerateImageRequestDto {
    scene;
}
exports.GenerateImageRequestDto = GenerateImageRequestDto;
class GenerateImageResponseDto {
    scene;
}
exports.GenerateImageResponseDto = GenerateImageResponseDto;
class GenerateVideoRequestDto {
    scene;
}
exports.GenerateVideoRequestDto = GenerateVideoRequestDto;
class GenerateVideoResponseDto {
    scene;
}
exports.GenerateVideoResponseDto = GenerateVideoResponseDto;
class GenerateAudioRequestDto {
    scene;
}
exports.GenerateAudioRequestDto = GenerateAudioRequestDto;
class GenerateAudioResponseDto {
    scene;
}
exports.GenerateAudioResponseDto = GenerateAudioResponseDto;
class AssembleVideoRequestDto {
    scenes;
    projectName;
}
exports.AssembleVideoRequestDto = AssembleVideoRequestDto;
class AssembleVideoResponseDto {
    finalVideoPath;
}
exports.AssembleVideoResponseDto = AssembleVideoResponseDto;
//# sourceMappingURL=content.model.js.map