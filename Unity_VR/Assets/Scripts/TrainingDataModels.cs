using System;
using System.Collections.Generic;

/// <summary>
/// Pure C# data model classes that mirror the training JSON structure.
/// These are deserialized by Unity's JsonUtility and contain NO Unity references.
/// Runtime asset resolution (prefabs, textures) is handled by TrainingDataLoader.
/// </summary>
/// 
// ─── Root ────────────────────────────────────────────────────────────
[Serializable]
public class TrainingModuleData
{
    public string moduleId;
    public string title;
    public string version;
    public string mode;           // "VR" | "AR"
    public int    estimatedDurationMin;
    public string language;
    public List<TrainingTaskData> tasks;
}

// ─── Task (group of steps) ───────────────────────────────────────────
[Serializable]
public class TrainingTaskData
{
    public int    taskId;
    public string taskTitle;
    public List<TrainingStepData> steps;
}

// ─── Step ────────────────────────────────────────────────────────────
[Serializable]
public class TrainingStepData
{
    public int    stepId;
    public string title;
    public string description;
    public string instructionType;   // info | safety | observe | action | inspect | completion | question

    public StepMediaData       media;
    public List<StepModelData> models;   // multiple 3D models per step
    public StepInteractionData interactions;
    public CompletionCriteria  completionCriteria;

    /// Only used when instructionType == "question"
    public List<QuestionChoiceData> choices;
}

// ─── Question choice (branching button) ──────────────────────────────
[Serializable]
public class QuestionChoiceData
{
    public string label;       // button text
    public int    goToStepId;  // stepId to jump to when clicked
}

// ─── Media (image / video) ───────────────────────────────────────────
[Serializable]
public class StepMediaData
{
    public string type;    // "image" | "video"
    public string path;    // Resources-relative path (no extension)
}

// ─── 3D model (GLB prefab) ──────────────────────────────────────────
[Serializable]
public class StepModelData
{
    public string    path;        // Resources-relative path to prefab
    public string    animation;   // animation clip / state name
    public bool      animationLoop; // whether to loop the animation
    public SpawnData spawn;
}

[Serializable]
public class SpawnData
{
    public float[] position;   // [x, y, z]
    public float[] rotation;   // [x, y, z] euler
    public float   scale;

    public UnityEngine.Vector3 Position =>
        position != null && position.Length == 3
            ? new UnityEngine.Vector3(position[0], position[1], position[2])
            : UnityEngine.Vector3.zero;

    public UnityEngine.Quaternion Rotation =>
        rotation != null && rotation.Length == 3
            ? UnityEngine.Quaternion.Euler(rotation[0], rotation[1], rotation[2])
            : UnityEngine.Quaternion.identity;

    public float Scale => scale > 0f ? scale : 1f;
}

// ─── Interaction metadata ────────────────────────────────────────────
[Serializable]
public class StepInteractionData
{
    public string requiredAction;   // confirm_ppe | press_switch | grab_and_rotate | …
    public string inputMethod;      // ui_button | null
    public string target;           // object / component name(s) — comma-separated
    public string hand;             // left | right | null
    public int    attemptsAllowed;  // 0 = unlimited
}

// ─── Completion criteria ─────────────────────────────────────────────
[Serializable]
public class CompletionCriteria
{
    public string type;    // button_clicked | user_confirmed | time_spent | interaction_completed | animation_completed
    public string value;
}
