using UnityEngine;
using UnityEngine.Networking;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;
using GLTFast;

/// <summary>
/// Loads training JSON from a remote API (primary) or a local TextAsset (fallback).
/// Resolves asset paths:
///   • URL paths  (start with "/" or "http") → downloaded from the backend server
///   • Resources paths → loaded from Assets/Resources/ as before
///
/// API Mode:
///   Set apiBaseUrl in the Inspector (e.g. http://localhost:8000).
///   Call LoadFromApi(jsonPath, callback) where jsonPath comes from the catalog.
///
/// Local Mode (fallback / editor):
///   Assign trainingJson in the Inspector. Call Load() synchronously.
///
/// SETUP:
///   1. 3D prefabs    in Assets/Resources/Prefabs/GLB/
///   2. Image textures in Assets/Resources/Prefabs/Media/
/// </summary>
public class TrainingDataLoader : MonoBehaviour
{
    [Header("API Settings")]
    [Tooltip("Base URL of the authoring backend (e.g. http://localhost:8000)")]
    public string apiBaseUrl = "http://localhost:8000";

    [Header("Local Fallback")]
    [Tooltip("Optional: drag a local training JSON file here for offline use")]
    public TextAsset trainingJson;

    /// Parsed module data (pure JSON data)
    public TrainingModuleData ModuleData { get; private set; }

    // ── Resolved asset caches ────────────────────────────────────────
    Dictionary<string, GameObject>      prefabCache   = new Dictionary<string, GameObject>();
    Dictionary<string, Texture2D>       textureCache  = new Dictionary<string, Texture2D>();
    Dictionary<string, AnimationClip[]> animClipCache = new Dictionary<string, AnimationClip[]>();
    List<GltfImport> loadedGltfImports = new List<GltfImport>();

    // Hidden root that keeps template objects deactivated
    Transform _templateRoot;
    Transform TemplateRoot
    {
        get
        {
            if (_templateRoot == null)
            {
                var go = new GameObject("[GLB_Templates]");
                go.SetActive(false);
                DontDestroyOnLoad(go);
                _templateRoot = go.transform;
            }
            return _templateRoot;
        }
    }

    /// <summary>
    /// Ensures step.model.animationLoop is set correctly.
    /// The Unity JSON has "animationLoop" inside the nested "model" object
    /// (deserialized directly into StepModelData.animationLoop). The top-level
    /// model_animation_loop only exists in the CMS API responses. Use OR so
    /// we never overwrite a correct true value with the missing default of false.
    /// </summary>
    void MapModelLoopFlags()
    {
        if (ModuleData == null || ModuleData.tasks == null) return;

        foreach (var task in ModuleData.tasks)
        {
            if (task?.steps == null) continue;
            foreach (var step in task.steps)
            {
                if (step == null) continue;
                if (step.model == null)
                    step.model = new StepModelData();

                // Use OR: model.animationLoop may already be true from nested JSON,
                // model_animation_loop may be true from flat CMS JSON.
                step.model.animationLoop = step.model.animationLoop || step.model_animation_loop;

                Debug.Log($"[TrainingDataLoader] Step '{step.title}' (id={step.stepId}): " +
                          $"model.animationLoop={step.model.animationLoop}, model_animation_loop={step.model_animation_loop}");
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /// <summary>Returns true if a path is a server URL rather than a Resources path.</summary>
    bool IsUrlPath(string path)
    {
        return !string.IsNullOrEmpty(path)
            && (path.StartsWith("/") || path.StartsWith("http"));
    }

    /// <summary>Prepends apiBaseUrl if the path is relative (starts with /).</summary>
    string ResolveFullUrl(string path)
    {
        if (path.StartsWith("http")) return path;
        return apiBaseUrl.TrimEnd('/') + path;
    }

    // ══════════════════════════════════════════════════════════════════
    //  API Loading (async)
    // ══════════════════════════════════════════════════════════════════

    /// <summary>
    /// Fetch a training module JSON from the API asynchronously.
    /// jsonPath is the relative path from the catalog (e.g. "/api/unity/modules/fire-safety/").
    /// Assets (GLB, textures) referenced in the JSON are pre-downloaded before the callback fires.
    /// </summary>
    public void LoadFromApi(string jsonPath, Action<TrainingModuleData> onComplete)
    {
        StartCoroutine(FetchModuleCoroutine(jsonPath, onComplete));
    }

    IEnumerator FetchModuleCoroutine(string jsonPath, Action<TrainingModuleData> onComplete)
    {
        string url = apiBaseUrl.TrimEnd('/') + jsonPath;
        Debug.Log($"[TrainingDataLoader] Fetching module from: {url}");

        using (var request = UnityWebRequest.Get(url))
        {
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[TrainingDataLoader] API request failed: {request.error} (URL: {url})");
                onComplete?.Invoke(null);
                yield break;
            }

            string json = request.downloadHandler.text;
            Debug.Log($"[TrainingDataLoader] Raw API JSON (first 500 chars): {json.Substring(0, Mathf.Min(json.Length, 500))}");

            ModuleData = JsonUtility.FromJson<TrainingModuleData>(json);

            if (ModuleData == null || ModuleData.tasks == null)
            {
                Debug.LogError("[TrainingDataLoader] Failed to parse API response.");
                onComplete?.Invoke(null);
                yield break;
            }

            // Map any top-level model_animation_loop flags into nested StepModelData.animationLoop
            MapModelLoopFlags();
            Debug.Log("[TrainingDataLoader] After mapping model loop flags — sample step flags:");
            // Log first few steps for verification
            for (int t=0; t < Mathf.Min(ModuleData.tasks.Count, 3); t++){
                var task = ModuleData.tasks[t];
                if (task?.steps == null) continue;
                for (int s=0; s < Mathf.Min(task.steps.Count, 3); s++){
                    var step = task.steps[s];
                    Debug.Log($"  Task {t} Step {s} id={step.stepId} model_animation_loop={step.model_animation_loop} model.animationLoop={step.model?.animationLoop}");
                }
            }

            Debug.Log($"[TrainingDataLoader] Loaded module from API: {ModuleData.title} ({ModuleData.tasks.Count} tasks)");

            // Pre-download all referenced assets before signalling ready
            yield return PreloadAssetsCoroutine();

            onComplete?.Invoke(ModuleData);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  Local Loading (sync, fallback)
    // ══════════════════════════════════════════════════════════════════

    /// <summary>
    /// Parse training JSON from the local TextAsset. Returns null on failure.
    /// </summary>
    public TrainingModuleData Load()
    {
        if (trainingJson == null)
        {
            Debug.LogError("[TrainingDataLoader] No training JSON assigned!");
            return null;
        }

        ModuleData = JsonUtility.FromJson<TrainingModuleData>(trainingJson.text);

        if (ModuleData == null || ModuleData.tasks == null)
        {
            Debug.LogError("[TrainingDataLoader] Failed to parse training JSON.");
            return null;
        }

        // Map any top-level model_animation_loop flags into nested StepModelData.animationLoop
        MapModelLoopFlags();
        Debug.Log("[TrainingDataLoader] After mapping model loop flags (local load):");
        if (ModuleData.tasks != null)
        {
            for (int t=0; t < Mathf.Min(ModuleData.tasks.Count, 3); t++){
                var task = ModuleData.tasks[t];
                if (task?.steps == null) continue;
                for (int s=0; s < Mathf.Min(task.steps.Count, 3); s++){
                    var step = task.steps[s];
                    Debug.Log($"  (local) Task {t} Step {s} id={step.stepId} model_animation_loop={step.model_animation_loop} model.animationLoop={step.model?.animationLoop}");
                }
            }
        }

        Debug.Log($"[TrainingDataLoader] Loaded module (local): {ModuleData.title} ({ModuleData.tasks.Count} tasks)");
        PreloadAssetsSync();
        return ModuleData;
    }

    // ══════════════════════════════════════════════════════════════════
    //  Asset resolution (sync — works from cache or Resources)
    // ══════════════════════════════════════════════════════════════════

    public GameObject ResolvePrefab(string path)
    {
        if (string.IsNullOrEmpty(path)) return null;

        if (prefabCache.TryGetValue(path, out var cached))
            return cached;

        // Only try Resources.Load for non-URL paths
        if (!IsUrlPath(path))
        {
            var prefab = Resources.Load<GameObject>(path);
            if (prefab == null)
                Debug.LogWarning($"[TrainingDataLoader] Prefab not found at Resources/{path}");
            prefabCache[path] = prefab;
            return prefab;
        }

        Debug.LogWarning($"[TrainingDataLoader] Prefab not in cache for URL path: {path} — was PreloadAssets called?");
        return null;
    }

    public Texture2D ResolveTexture(string path)
    {
        if (string.IsNullOrEmpty(path)) return null;

        if (textureCache.TryGetValue(path, out var cached))
            return cached;

        // Only try Resources.Load for non-URL paths
        if (!IsUrlPath(path))
        {
            var tex = Resources.Load<Texture2D>(path);
            if (tex == null)
                Debug.LogWarning($"[TrainingDataLoader] Texture not found at Resources/{path}");
            textureCache[path] = tex;
            return tex;
        }

        Debug.LogWarning($"[TrainingDataLoader] Texture not in cache for URL path: {path} — was PreloadAssets called?");
        return null;
    }

    /// <summary>
    /// Returns cached animation clips for a model path (from glTFast import).
    /// Falls back to Resources.LoadAll for local paths.
    /// </summary>
    public AnimationClip[] ResolveAnimationClips(string path)
    {
        if (string.IsNullOrEmpty(path)) return null;

        if (animClipCache.TryGetValue(path, out var cached))
            return cached;

        // Fallback: try loading from Resources (for local prefab paths)
        if (!IsUrlPath(path))
        {
            var clips = Resources.LoadAll<AnimationClip>(path);
            if (clips != null && clips.Length > 0)
            {
                animClipCache[path] = clips;
                return clips;
            }
        }

        return null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  Cache management
    // ══════════════════════════════════════════════════════════════════

    /// <summary>
    /// Clears downloaded asset caches (prefabs, textures, animations)
    /// but keeps ModuleData intact so it can be read by StepManager.
    /// </summary>
    public void ClearAssetCaches()
    {
        // Destroy template GameObjects
        foreach (var kvp in prefabCache)
        {
            if (kvp.Value != null)
                Destroy(kvp.Value);
        }
        prefabCache.Clear();
        textureCache.Clear();
        animClipCache.Clear();

        // Dispose glTFast imports
        foreach (var gltf in loadedGltfImports)
        {
            if (gltf != null)
                gltf.Dispose();
        }
        loadedGltfImports.Clear();

        Debug.Log("[TrainingDataLoader] Asset caches cleared (module data preserved).");
    }

    /// <summary>
    /// Full reset — clears everything including module data.
    /// Called when returning to the home page.
    /// </summary>
    public void ClearCaches()
    {
        ClearAssetCaches();
        ModuleData = null;
        Debug.Log("[TrainingDataLoader] All caches cleared.");
    }

    // ══════════════════════════════════════════════════════════════════
    //  Pre-loading (async — downloads URL assets)
    // ══════════════════════════════════════════════════════════════════

    IEnumerator PreloadAssetsCoroutine()
    {
        // Collect unique asset paths
        var texturePaths = new HashSet<string>();
        var modelPaths   = new HashSet<string>();

        foreach (var task in ModuleData.tasks)
        {
            foreach (var step in task.steps)
            {
                if (step.model != null && !string.IsNullOrEmpty(step.model.path))
                    modelPaths.Add(step.model.path);

                if (step.media != null && !string.IsNullOrEmpty(step.media.path))
                {
                    if (step.media.type == "image")
                        texturePaths.Add(step.media.path);
                    // video handled separately at display time
                }
            }
        }

        Debug.Log($"[TrainingDataLoader] Pre-loading {modelPaths.Count} model(s), {texturePaths.Count} texture(s)…");

        // Download textures
        foreach (var path in texturePaths)
        {
            if (textureCache.ContainsKey(path)) continue;

            if (IsUrlPath(path))
                yield return DownloadTextureCoroutine(path);
            else
                ResolveTexture(path);       // sync Resources.Load
        }

        // Download / load GLB models
        foreach (var path in modelPaths)
        {
            if (prefabCache.ContainsKey(path)) continue;

            if (IsUrlPath(path))
                yield return LoadGltfFromUrlCoroutine(path);
            else
                ResolvePrefab(path);        // sync Resources.Load
        }

        Debug.Log($"[TrainingDataLoader] Pre-loaded {prefabCache.Count} prefab(s), {textureCache.Count} texture(s), {animClipCache.Count} animation set(s).");
    }

    /// <summary>Synchronous preload — only for Resources-based local paths.</summary>
    void PreloadAssetsSync()
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
        Debug.Log($"[TrainingDataLoader] Pre-loaded {prefabCache.Count} prefab(s), {textureCache.Count} texture(s).");
    }

    // ── Download a texture from URL ──────────────────────────────────

    IEnumerator DownloadTextureCoroutine(string path)
    {
        string url = ResolveFullUrl(path);
        Debug.Log($"[TrainingDataLoader] Downloading texture: {url}");

        using (var request = UnityWebRequestTexture.GetTexture(url))
        {
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[TrainingDataLoader] Texture download failed: {request.error} ({url})");
                yield break;
            }

            var tex = DownloadHandlerTexture.GetContent(request);
            if (tex != null)
            {
                textureCache[path] = tex;
                Debug.Log($"[TrainingDataLoader] Texture cached: {path}");
            }
        }
    }

    // ── Load a GLB model from URL via glTFast ────────────────────────

    IEnumerator LoadGltfFromUrlCoroutine(string path)
    {
        string url = ResolveFullUrl(path);
        Debug.Log($"[TrainingDataLoader] Loading GLB from: {url}");

        var gltf = new GltfImport();
        var loadTask = gltf.Load(url);

        // Wait for the async Task to complete inside the coroutine
        while (!loadTask.IsCompleted)
            yield return null;

        if (loadTask.IsFaulted || !loadTask.Result)
        {
            Debug.LogError($"[TrainingDataLoader] GLB load failed: {url} — {loadTask.Exception?.Message}");
            gltf.Dispose();
            yield break;
        }

        // Create a hidden template GameObject to hold the instantiated scene
        var template = new GameObject($"GLB_{path.GetHashCode():X8}");
        template.transform.SetParent(TemplateRoot, false);

        var instantiateTask = gltf.InstantiateMainSceneAsync(template.transform);
        while (!instantiateTask.IsCompleted)
            yield return null;

        bool instantiated = instantiateTask.Result;
        if (!instantiated)
        {
            Debug.LogError($"[TrainingDataLoader] GLB instantiation failed: {url}");
            Destroy(template);
            gltf.Dispose();
            yield break;
        }

        prefabCache[path] = template;
        loadedGltfImports.Add(gltf);

        // Cache animation clips from the glTF import
        var clips = gltf.GetAnimationClips();
        if (clips != null && clips.Length > 0)
        {
            // Convert clips from legacy to non-legacy at cache time so the
            // Playables API can use them without per-step conversion.
            foreach (var clip in clips)
            {
                if (clip != null && clip.legacy)
                {
                    clip.legacy = false;
                    Debug.Log($"[TrainingDataLoader] Converted clip '{clip.name}' from legacy to non-legacy.");
                }
            }
            animClipCache[path] = clips;
            Debug.Log($"[TrainingDataLoader] Cached {clips.Length} animation clip(s) for: {path}");
        }

        // Remove the legacy Animation component that glTFast adds to the
        // template.  This prevents "must be marked as Legacy" errors when
        // the template is later cloned with Instantiate().
        foreach (var legacyAnim in template.GetComponentsInChildren<Animation>(true))
        {
            Debug.Log($"[TrainingDataLoader] Removing legacy Animation component from '{legacyAnim.gameObject.name}'.");
            Destroy(legacyAnim);
        }

        Debug.Log($"[TrainingDataLoader] GLB cached: {path} ({template.transform.childCount} root children)");
    }
}
