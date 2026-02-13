using UnityEngine;
using System.Collections.Generic;

/// <summary>
/// Loads the training JSON and resolves asset paths to actual Unity resources.
/// 
/// Current mode  : loads prefab / texture from Resources folders.
/// Production    : swap this loader to fetch from a remote server / asset bundles.
/// 
/// SETUP:
///   1. Move (or keep) your GLB prefab into  Assets/Resources/Prefabs/GLB/
///   2. Move (or keep) your images into       Assets/Resources/Prefabs/Media/
///   3. Put the JSON TextAsset reference in the Inspector.
/// </summary>
public class TrainingDataLoader : MonoBehaviour
{
    [Header("Training JSON (TextAsset)")]
    [Tooltip("Drag the training_001.json file here")]
    public TextAsset trainingJson;

    /// Parsed module data (pure JSON data)
    public TrainingModuleData ModuleData { get; private set; }

    // ── Resolved asset caches ────────────────────────────────────────
    // key = Resources-relative path from JSON  →  value = loaded asset
    Dictionary<string, GameObject>  prefabCache  = new Dictionary<string, GameObject>();
    Dictionary<string, Texture2D>   textureCache = new Dictionary<string, Texture2D>();

    /// <summary>
    /// Call once to parse the JSON and pre-warm asset caches.
    /// Returns the fully parsed TrainingModuleData.
    /// </summary>
    public TrainingModuleData Load()
    {
        if (trainingJson == null)
        {
            Debug.LogError("[TrainingDataLoader] No training JSON assigned!");
            return null;
        }

        // JsonUtility needs a wrapper because the root is an object
        ModuleData = JsonUtility.FromJson<TrainingModuleData>(trainingJson.text);

        if (ModuleData == null || ModuleData.tasks == null)
        {
            Debug.LogError("[TrainingDataLoader] Failed to parse training JSON.");
            return null;
        }

        Debug.Log($"[TrainingDataLoader] Loaded module: {ModuleData.title}  " +
                  $"({ModuleData.tasks.Count} tasks)");

        PreloadAssets();
        return ModuleData;
    }

    // ── Asset resolution ─────────────────────────────────────────────

    /// <summary>
    /// Resolve a model path from JSON → actual prefab (from Resources).
    /// </summary>
    public GameObject ResolvePrefab(string resourcePath)
    {
        if (string.IsNullOrEmpty(resourcePath)) return null;

        if (prefabCache.TryGetValue(resourcePath, out var cached))
            return cached;

        var prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
            Debug.LogWarning($"[TrainingDataLoader] Prefab not found at Resources/{resourcePath}");

        prefabCache[resourcePath] = prefab;
        return prefab;
    }

    /// <summary>
    /// Resolve a media image path from JSON → actual Texture2D (from Resources).
    /// </summary>
    public Texture2D ResolveTexture(string resourcePath)
    {
        if (string.IsNullOrEmpty(resourcePath)) return null;

        if (textureCache.TryGetValue(resourcePath, out var cached))
            return cached;

        var tex = Resources.Load<Texture2D>(resourcePath);
        if (tex == null)
            Debug.LogWarning($"[TrainingDataLoader] Texture not found at Resources/{resourcePath}");

        textureCache[resourcePath] = tex;
        return tex;
    }

    /// <summary>
    /// Clears cached assets so a fresh module can be loaded.
    /// Called by AppFlowManager before switching modules.
    /// </summary>
    public void ClearCaches()
    {
        prefabCache.Clear();
        textureCache.Clear();
        ModuleData = null;
        Debug.Log("[TrainingDataLoader] Caches cleared.");
    }

    // ── Pre-load all assets referenced by the JSON ───────────────────
    void PreloadAssets()
    {
        foreach (var task in ModuleData.tasks)
        {
            foreach (var step in task.steps)
            {
                if (step.model != null && !string.IsNullOrEmpty(step.model.path))
                    ResolvePrefab(step.model.path);

                if (step.media != null && step.media.type == "image"
                    && !string.IsNullOrEmpty(step.media.path))
                    ResolveTexture(step.media.path);
            }
        }

        Debug.Log($"[TrainingDataLoader] Pre-loaded {prefabCache.Count} prefab(s), " +
                  $"{textureCache.Count} texture(s).");
    }
}
