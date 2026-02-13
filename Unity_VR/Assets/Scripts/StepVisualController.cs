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
        ShowStepVisual(glbPrefab, animationName, position, rotation, scale, null);
    }

    /// <summary>
    /// Full overload with model resource path so we can load AnimationClips from Resources
    /// when the prefab has no AnimatorController or legacy Animation component.
    /// </summary>
    public void ShowStepVisual(
        GameObject glbPrefab,
        string     animationName,
        Vector3    position,
        Quaternion rotation,
        float      scale,
        string     modelResourcePath)
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
        currentInstance.transform.localScale = Vector3.one * scale;

        PlayAnimation(animationName, modelResourcePath);
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

    // ── Animation helpers ────────────────────────────────────────────
    void PlayAnimation(string animationName, string modelResourcePath)
    {
        if (currentInstance == null) return;

        // Always play from GLB clips (no AnimatorController, no legacy Animation required).
        // Load clips directly from the model's Resources path.
        AnimationClip[] clips = null;
        if (!string.IsNullOrEmpty(modelResourcePath))
            clips = Resources.LoadAll<AnimationClip>(modelResourcePath);

        if (clips == null || clips.Length == 0)
        {
            Debug.LogWarning(
                "[StepVisualController] No AnimationClip sub-assets found for model at Resources/" +
                modelResourcePath + ". Ensure the GLB has animations imported."
            );
            return;
        }

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
        }
        if (selected == null)
            selected = clips[0];

        if (selected == null)
        {
            Debug.LogWarning("[StepVisualController] Animation clip selection failed.");
            return;
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

        animationGraph = PlayableGraph.Create("StepAnimationGraph");
        var output = AnimationPlayableOutput.Create(animationGraph, "Animation", animator);
        var clipPlayable = AnimationClipPlayable.Create(animationGraph, selected);
        output.SetSourcePlayable(clipPlayable);
        animationGraph.Play();
        graphInitialized = true;
    }
}
