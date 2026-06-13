import type { SceneScript } from "../content-state";
export declare const contentGraph: import("@langchain/langgraph").CompiledStateGraph<{
    topic: string;
    idea: string | undefined;
    story: string | undefined;
    script: SceneScript[] | undefined;
}, {
    topic?: string | undefined;
    idea?: string | undefined;
    story?: string | undefined;
    script?: SceneScript[] | undefined;
}, "generateIdea" | "__start__" | "writeStory" | "buildScript", {
    topic: {
        (annotation: import("@langchain/langgraph").SingleReducer<string, string>): import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
        (): import("@langchain/langgraph").LastValue<string>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    idea: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    story: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    script: {
        (annotation: import("@langchain/langgraph").SingleReducer<SceneScript[] | undefined, SceneScript[] | undefined>): import("@langchain/langgraph").BaseChannel<SceneScript[] | undefined, SceneScript[] | import("@langchain/langgraph").OverwriteValue<SceneScript[] | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<SceneScript[] | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
}, {
    topic: {
        (annotation: import("@langchain/langgraph").SingleReducer<string, string>): import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
        (): import("@langchain/langgraph").LastValue<string>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    idea: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    story: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    script: {
        (annotation: import("@langchain/langgraph").SingleReducer<SceneScript[] | undefined, SceneScript[] | undefined>): import("@langchain/langgraph").BaseChannel<SceneScript[] | undefined, SceneScript[] | import("@langchain/langgraph").OverwriteValue<SceneScript[] | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<SceneScript[] | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
}, import("@langchain/langgraph").StateDefinition, {
    generateIdea: {
        idea: string;
    };
    writeStory: {
        story: string;
    };
    buildScript: {
        script: SceneScript[];
    };
}, unknown, unknown, []>;
