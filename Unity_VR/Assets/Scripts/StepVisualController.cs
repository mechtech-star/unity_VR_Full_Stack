using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Animations;
using System.Collections.Generic;

/// <summary>
/// Spawns and manages 3D models for each training step.
/// Supports multiple simultaneous models per step, each with
/// independent transforms and animations.
/// </summary>
public class StepVisualController : MonoBehaviour
{
    [Header("Spawn Settings")]
    [Tooltip("Fallback parent when JSON spawn position is (0,0,0)")]
    public Transform spawnPoint;

    // ── Per-model tracking ───────────────────────────────────────────
    struct ModelInstance
    {
        public GameObject gameObject;
        public PlayableGraph graph;
        public bool graphInitialized;
        public AnimationClipPlayable clipPlayable;
        public float clipLength;
        public bool isLooping;
    }

    List<ModelInstance> activeModels = new List<ModelInstance>();

    /// <summary>
    /// Add a model to the current step's scene. Call once per model.
    /// StepManager calls Clear() first, then AddModel() for each model in the step.
    /// </summary>
    public void AddModel(
        GameObject glbPrefab,
        string     animationName,
        Vector3    position,
        Quaternion rotation,
        float      scale,
        string     modelResourcePath,
        AnimationClip[] preloadedClips = null,
        bool       loop = false)
    {
        if (glbPrefab == null)
        {
            Debug.LogWarning("[StepVisualController] No GLB prefab — skipping this model.");
            return;
        }

        // Use spawnPoint as origin offset if provided; otherwise use world origin
        Vector3 basePos       = spawnPoint != null ? spawnPoint.position : Vector3.zero;
        Quaternion baseRot    = spawnPoint != null ? spawnPoint.rotation : Quaternion.identity;

        Vector3 finalPos      = basePos + position;
        Quaternion finalRot   = baseRot * rotation;

        var instance = Instantiate(glbPrefab, finalPos, finalRot);
        // Ensure the instance is active (template objects from glTFast may be under a deactivated root)
        instance.SetActive(true);
        instance.transform.localScale = Vector3.one * scale;

        var mi = new ModelInstance
        {
            gameObject = instance,
            graph = default,
            graphInitialized = false,
            clipPlayable = default,
            clipLength = 0f,
            isLooping = false
        };

        PlayAnimation(ref mi, animationName, modelResourcePath, preloadedClips, loop);
        activeModels.Add(mi);
    }

    /// <summary>
    /// Legacy single-model overload — keeps backward-compatibility.
    /// Clears all models first and adds one.
    /// </summary>
    public void ShowStepVisual(
        GameObject glbPrefab,
        string     animationName,
        Vector3    position,
        Quaternion rotation,
        float      scale,
        string     modelResourcePath,
        AnimationClip[] preloadedClips = null,
        bool       loop = false)
    {
        Clear();
        AddModel(glbPrefab, animationName, position, rotation, scale, modelResourcePath, preloadedClips, loop);
    }

    public void ShowStepVisual(
        GameObject glbPrefab,
        string     animationName,
        Vector3    position,
        Quaternion rotation,
        float      scale)
    {
        ShowStepVisual(glbPrefab, animationName, position, rotation, scale, null, null);
    }

    public void ShowStepVisual(GameObject glbPrefab, string animationName)
    {
        ShowStepVisual(glbPrefab, animationName, Vector3.zero, Quaternion.identity, 1f);
    }

    public void Clear()
    {
        foreach (var mi in activeModels)
        {
            if (mi.gameObject != null)
                Destroy(mi.gameObject);
            if (mi.graphInitialized && mi.graph.IsValid())
                mi.graph.Destroy();
        }
        activeModels.Clear();
    }

    void OnDestroy()
    {
        Clear();
    }

    /// <summary>
    /// Manually wrap playable time for any looping models.
    /// </summary>
    void Update()
    {
        for (int i = 0; i < activeModels.Count; i++)
        {
            var mi = activeModels[i];
            if (!mi.isLooping || !mi.graphInitialized) continue;
            if (!mi.graph.IsValid() || !mi.graph.IsPlaying()) continue;

            double time = mi.clipPlayable.GetTime();
            if (time >= mi.clipLength)
            {
                mi.clipPlayable.SetTime(time % mi.clipLength);
            }
        }
    }

    // ── Animation helpers ────────────────────────────────────────────
    void PlayAnimation(ref ModelInstance mi, string animationName, string modelResourcePath, AnimationClip[] preloadedClips, bool loop)
    {
        if (mi.gameObject == null) return;

        // 1. Use pre-loaded clips (from glTFast URL loading) if available
        AnimationClip[] clips = preloadedClips;

        // 2. Fallback: load from Resources (for local prefab paths)
        if ((clips == null || clips.Length == 0) && !string.IsNullOrEmpty(modelResourcePath))
            clips = Resources.LoadAll<AnimationClip>(modelResourcePath);

        if (clips == null || clips.Length == 0)
        {
            Debug.LogWarning(
                "[StepVisualController] No AnimationClip sub-assets found for model at Resources/" +
                modelResourcePath + ". Ensure the GLB has animations imported."
            );
            return;
        }

        // Log available clip names for debugging
        Debug.Log($"[StepVisualController] Available clips ({clips.Length}): " +
                  string.Join(", ", System.Array.ConvertAll(clips, c => c != null ? $"{c.name} (legacy={c.legacy})" : "null")));
        Debug.Log($"[StepVisualController] Requested animation: '{animationName}'");

        // Select clip by name or default to first
        AnimationClip selected = null;
        if (!string.IsNullOrEmpty(animationName))
        {
            foreach (var clip in clips)
            {
                if (clip != null && clip.name == animationName)
                {
                    selected = clip;
                    break;
                }
            }
            // If exact match failed, try case-insensitive contains
            if (selected == null)
            {
                foreach (var clip in clips)
                {
                    if (clip != null && clip.name.IndexOf(animationName, System.StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        Debug.Log($"[StepVisualController] Fuzzy-matched '{animationName}' → '{clip.name}'");
                        selected = clip;
                        break;
                    }
                }
            }
        }
        if (selected == null)
            selected = clips[0];

        if (selected == null)
        {
            Debug.LogWarning("[StepVisualController] Animation clip selection failed.");
            return;
        }

        // Set wrap mode based on loop flag.
        selected.wrapMode = loop ? WrapMode.Loop : WrapMode.Once;

        // Safety: ensure non-legacy for Playables API
        if (selected.legacy)
        {
            Debug.LogWarning($"[StepVisualController] Clip '{selected.name}' was still legacy — converting.");
            selected.legacy = false;
        }

        // Remove any residual legacy Animation component on the clone
        var legacyAnim = mi.gameObject.GetComponentInChildren<Animation>();
        if (legacyAnim != null)
        {
            Debug.Log("[StepVisualController] Removing residual legacy Animation component from clone.");
            Destroy(legacyAnim);
        }

        // Ensure an Animator exists so Playables can drive the pose
        var animator = mi.gameObject.GetComponentInChildren<Animator>();
        if (animator == null)
            animator = mi.gameObject.AddComponent<Animator>();

        try
        {
            Debug.Log($"[StepVisualController] Playing clip '{selected.name}' loop={loop} length={selected.length}s wrapMode={selected.wrapMode}");
            mi.graph = PlayableGraph.Create("StepAnimationGraph");
            mi.graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
            var output = AnimationPlayableOutput.Create(mi.graph, "Animation", animator);
            var clipPlayable = AnimationClipPlayable.Create(mi.graph, selected);

            if (loop)
                clipPlayable.SetDuration(double.MaxValue);

            output.SetSourcePlayable(clipPlayable);
            mi.graph.Play();
            mi.graphInitialized = true;

            // Store loop state for Update() time-wrapping
            mi.clipPlayable = clipPlayable;
            mi.clipLength = selected.length;
            mi.isLooping = loop;

            Debug.Log($"[StepVisualController] Graph playing: {mi.graph.IsPlaying()}, " +
                      $"clip duration={selected.length}s, playable duration={clipPlayable.GetDuration()}, isLooping={mi.isLooping}");
        }
        catch (System.Exception ex)
        {
            Debug.LogError($"[StepVisualController] Playable animation failed: {ex.Message}");
            if (mi.graph.IsValid())
                mi.graph.Destroy();
            mi.graphInitialized = false;
        }
    }
}
