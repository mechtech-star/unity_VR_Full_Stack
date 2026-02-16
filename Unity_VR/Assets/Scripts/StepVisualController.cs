using UnityEngine;
using System.Collections.Generic;

/// <summary>
/// Spawns and manages 3D models for each training step.
/// Supports multiple simultaneous models per step, each with
/// independent transforms and animations.
///
/// Animation strategy:
///   glTFast imports GLB animations as **Legacy** AnimationClips and adds
///   a Legacy `Animation` component.  We use that directly — converting
///   to Mecanim/Playables is fragile on Quest IL2CPP because curve
///   bindings created by glTFast don't survive the legacy→non-legacy
///   conversion at runtime.  The Legacy Animation system works reliably
///   on every platform for runtime-loaded content.
/// </summary>
public class StepVisualController : MonoBehaviour
{
    [Header("Spawn Settings")]
    [Tooltip("The origin point for all 3D models. AnchorPlacementManager moves this Transform to the user's chosen position.")]
    public Transform spawnPoint;

    // ── Per-model tracking ───────────────────────────────────────────
    struct ModelInstance
    {
        public GameObject gameObject;
        public Animation  animation;   // Legacy Animation component
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

        // spawnPoint is the single origin for all models.
        Vector3    basePos = spawnPoint != null ? spawnPoint.position : Vector3.zero;
        Quaternion baseRot = spawnPoint != null ? spawnPoint.rotation : Quaternion.identity;

        Vector3    finalPos = basePos + baseRot * position;
        Quaternion finalRot = baseRot * rotation;

        var instance = Instantiate(glbPrefab, finalPos, finalRot);
        instance.SetActive(true);
        instance.transform.localScale = Vector3.one * scale;

        var mi = new ModelInstance
        {
            gameObject = instance,
            animation  = null
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
            if (mi.animation != null && mi.animation.isPlaying)
                mi.animation.Stop();
            if (mi.gameObject != null)
                Destroy(mi.gameObject);
        }
        activeModels.Clear();
    }

    void OnDestroy()
    {
        Clear();
    }

    // ── Animation playback (Legacy Animation system) ─────────────────
    void PlayAnimation(ref ModelInstance mi, string animationName, string modelResourcePath, AnimationClip[] preloadedClips, bool loop)
    {
        if (mi.gameObject == null) return;

        // ── 1. Gather clips ─────────────────────────────────────────
        AnimationClip[] clips = preloadedClips;

        if ((clips == null || clips.Length == 0) && !string.IsNullOrEmpty(modelResourcePath))
            clips = Resources.LoadAll<AnimationClip>(modelResourcePath);

        if (clips == null || clips.Length == 0)
        {
            Debug.LogWarning(
                $"[StepVisualController] No animation clips found for model '{modelResourcePath}'. " +
                "Ensure the GLB has animations.");
            return;
        }

        Debug.Log($"[StepVisualController] Available clips ({clips.Length}): " +
                  string.Join(", ", System.Array.ConvertAll(clips, c =>
                      c != null ? $"'{c.name}' legacy={c.legacy} length={c.length}s" : "null")));
        Debug.Log($"[StepVisualController] Requested animation: '{animationName}', loop={loop}");

        // ── 2. Select clip by name (exact → fuzzy → first) ─────────
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
        if (selected == null && clips.Length > 0)
            selected = clips[0];

        if (selected == null)
        {
            Debug.LogWarning("[StepVisualController] Animation clip selection failed.");
            return;
        }

        // ── 3. Ensure clip is marked Legacy ─────────────────────────
        // glTFast already creates them as legacy, but be safe.
        if (!selected.legacy)
        {
            Debug.Log($"[StepVisualController] Clip '{selected.name}' is non-legacy — marking as legacy for Animation component.");
            selected.legacy = true;
        }

        // Set wrap mode
        selected.wrapMode = loop ? WrapMode.Loop : WrapMode.ClampForever;

        // ── 4. Get or create the Legacy Animation component ─────────
        // glTFast places it on the scene-root child (the first child
        // under our template root).  If it's missing (shouldn't be
        // with the new loader code), add one at the correct level.
        var anim = mi.gameObject.GetComponentInChildren<Animation>(true);
        if (anim == null)
        {
            // Prefer first child (glTF scene root) — curve bindings are
            // relative to this transform.
            Transform animTarget = mi.gameObject.transform.childCount > 0
                ? mi.gameObject.transform.GetChild(0)
                : mi.gameObject.transform;

            anim = animTarget.gameObject.AddComponent<Animation>();
            Debug.Log($"[StepVisualController] Added Animation component to '{animTarget.name}'.");
        }

        // Remove any Animator that might conflict with the Legacy system
        var animator = mi.gameObject.GetComponentInChildren<Animator>(true);
        if (animator != null)
        {
            Debug.Log($"[StepVisualController] Removing Animator from '{animator.gameObject.name}' — using Legacy Animation.");
            DestroyImmediate(animator);
        }

        mi.animation = anim;

        // ── 5. Add all clips to the Animation component ─────────────
        // This ensures the component knows about every clip so we can
        // Play() by name.  Clips may already be there from glTFast;
        // AddClip silently replaces duplicates.
        foreach (var clip in clips)
        {
            if (clip == null) continue;
            if (!clip.legacy) clip.legacy = true;
            anim.AddClip(clip, clip.name);
        }

        // ── 6. Play the selected clip ────────────────────────────────
        anim.clip = selected;
        anim.wrapMode = loop ? WrapMode.Loop : WrapMode.ClampForever;

        // Stop any currently playing animation first
        anim.Stop();
        anim.Play(selected.name);

        Debug.Log($"[StepVisualController] Playing clip '{selected.name}' via Legacy Animation " +
                  $"on '{anim.gameObject.name}', loop={loop}, length={selected.length}s, " +
                  $"isPlaying={anim.isPlaying}, isActiveAndEnabled={anim.isActiveAndEnabled}");

        // ── 7. Verify playback started ───────────────────────────────
        if (!anim.isPlaying)
        {
            Debug.LogWarning($"[StepVisualController] Animation.isPlaying is false after Play(). " +
                             $"Trying Sample() + Play() workaround...");
            anim.Sample();
            anim.Play(selected.name);
            Debug.Log($"[StepVisualController] After retry: isPlaying={anim.isPlaying}");
        }
    }
}
