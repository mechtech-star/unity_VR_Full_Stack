using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Animations;

/// <summary>
/// Spawns and manages the 3D model for each training step.
/// Now accepts spawn transform data (position, rotation, scale) from the JSON
/// so every step can place the model independently.
/// </summary>
public class StepVisualController : MonoBehaviour
{
    [Header("Spawn Settings")]
    [Tooltip("Fallback parent when JSON spawn position is (0,0,0)")]
    public Transform spawnPoint;

    GameObject currentInstance;
    PlayableGraph animationGraph;
    bool graphInitialized;

    // Loop state — used by Update() to manually wrap playable time
    AnimationClipPlayable activeClipPlayable;
    float activeClipLength;
    bool isLooping;

    /// <summary>
    /// Spawn a prefab with explicit transform values from the training JSON.
    /// If no spawnPoint override is needed, position/rotation come from JSON SpawnData.
    /// </summary>
    public void ShowStepVisual(
        GameObject glbPrefab,
        string     animationName,
        Vector3    position,
        Quaternion rotation,
        float      scale)
    {
        ShowStepVisual(glbPrefab, animationName, position, rotation, scale, null, null);
    }

    /// <summary>
    /// Full overload with model resource path and optional pre-loaded animation clips.
    /// When preloadedClips is provided (e.g. from glTFast URLloading), those are used directly.
    /// Otherwise clips are loaded from Resources via modelResourcePath.
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

        if (glbPrefab == null)
        {
            Debug.LogWarning("[StepVisualController] No GLB prefab for this step.");
            return;
        }

        // Use spawnPoint as origin offset if provided; otherwise use world origin
        Vector3 basePos       = spawnPoint != null ? spawnPoint.position : Vector3.zero;
        Quaternion baseRot    = spawnPoint != null ? spawnPoint.rotation : Quaternion.identity;

        Vector3 finalPos      = basePos + position;
        Quaternion finalRot   = baseRot * rotation;

        currentInstance = Instantiate(glbPrefab, finalPos, finalRot);
        // Ensure the instance is active (template objects from glTFast may be under a deactivated root)
        currentInstance.SetActive(true);
        currentInstance.transform.localScale = Vector3.one * scale;

        PlayAnimation(animationName, modelResourcePath, preloadedClips, loop);
    }

    /// <summary>
    /// Legacy overload — keeps backward-compatibility with any code that
    /// does not supply spawn data.
    /// </summary>
    public void ShowStepVisual(GameObject glbPrefab, string animationName)
    {
        ShowStepVisual(
            glbPrefab,
            animationName,
            Vector3.zero,
            Quaternion.identity,
            1f
        );
    }

    public void Clear()
    {
        isLooping = false;
        activeClipLength = 0f;

        if (currentInstance != null)
        {
            Destroy(currentInstance);
            currentInstance = null;
        }

        if (graphInitialized)
        {
            animationGraph.Destroy();
            graphInitialized = false;
        }
    }

    void OnDestroy()
    {
        Clear();
    }

    /// <summary>
    /// Manually wrap the playable time when looping.
    /// AnimationClipPlayable does NOT automatically loop — its local time
    /// advances past the clip length and the clip freezes on the last frame.
    /// We reset the time using modulo so it keeps cycling.
    /// </summary>
    void Update()
    {
        if (!isLooping || !graphInitialized) return;
        if (!animationGraph.IsValid() || !animationGraph.IsPlaying()) return;

        double time = activeClipPlayable.GetTime();
        if (time >= activeClipLength)
        {
            activeClipPlayable.SetTime(time % activeClipLength);
        }
    }

    // ── Animation helpers ────────────────────────────────────────────
    void PlayAnimation(string animationName, string modelResourcePath, AnimationClip[] preloadedClips, bool loop)
    {
        if (currentInstance == null) return;

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
        // Clips are already non-legacy (converted at cache time in TrainingDataLoader).
        selected.wrapMode = loop ? WrapMode.Loop : WrapMode.Once;

        // Safety: ensure non-legacy for Playables API (should already be done)
        if (selected.legacy)
        {
            Debug.LogWarning($"[StepVisualController] Clip '{selected.name}' was still legacy — converting.");
            selected.legacy = false;
        }

        // Remove any residual legacy Animation component on the clone —
        // it should already be stripped from the template, but be safe.
        var legacyAnim = currentInstance.GetComponentInChildren<Animation>();
        if (legacyAnim != null)
        {
            Debug.Log("[StepVisualController] Removing residual legacy Animation component from clone.");
            Destroy(legacyAnim);
        }

        // Ensure an Animator exists so Playables can drive the pose
        var animator = currentInstance.GetComponentInChildren<Animator>();
        if (animator == null)
            animator = currentInstance.AddComponent<Animator>();

        if (graphInitialized)
        {
            animationGraph.Destroy();
            graphInitialized = false;
        }

        try
        {
            Debug.Log($"[StepVisualController] Playing clip '{selected.name}' loop={loop} length={selected.length}s wrapMode={selected.wrapMode}");
            animationGraph = PlayableGraph.Create("StepAnimationGraph");
            animationGraph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
            var output = AnimationPlayableOutput.Create(animationGraph, "Animation", animator);
            var clipPlayable = AnimationClipPlayable.Create(animationGraph, selected);

            // For looping, set an infinite duration so the graph never
            // considers the playable "done" and keeps evaluating.
            // The actual time-wrap is handled in Update().
            if (loop)
                clipPlayable.SetDuration(double.MaxValue);

            output.SetSourcePlayable(clipPlayable);
            animationGraph.Play();
            graphInitialized = true;

            // Store loop state for Update() time-wrapping
            activeClipPlayable = clipPlayable;
            activeClipLength = selected.length;
            isLooping = loop;

            Debug.Log($"[StepVisualController] Graph playing: {animationGraph.IsPlaying()}, " +
                      $"clip duration={selected.length}s, playable duration={clipPlayable.GetDuration()}, isLooping={isLooping}");
        }
        catch (System.Exception ex)
        {
            Debug.LogError($"[StepVisualController] Playable animation failed: {ex.Message}");
            if (animationGraph.IsValid())
                animationGraph.Destroy();
            graphInitialized = false;
        }
    }
}
