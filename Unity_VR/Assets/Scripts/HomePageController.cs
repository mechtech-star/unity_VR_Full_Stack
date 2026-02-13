using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;
using System.Collections;

/// <summary>
/// Populates the home page with module cards from the catalog JSON.
/// Fetches the catalog from the backend API (primary) or a local TextAsset (fallback).
/// Each card shows module info and a "Start" button that fires an event
/// picked up by AppFlowManager to transition into the training view.
/// </summary>
public class HomePageController : MonoBehaviour
{
    [Header("UI")]
    public UIDocument uiDocument;

    [Header("API Settings")]
    [Tooltip("Base URL of the authoring backend (e.g. http://localhost:8000)")]
    public string apiBaseUrl = "http://localhost:8000";

    [Header("Local Fallback")]
    [Tooltip("Optional: drag a local module_catalog.json TextAsset here for offline use")]
    public TextAsset catalogJson;

    // ── Parsed data ──────────────────────────────────────────────────
    ModuleCatalogData catalog;

    // ── Event: a module was selected ─────────────────────────────────
    public delegate void ModuleSelected(ModuleSummaryData module);
    public event ModuleSelected OnModuleSelected;

    // ── UI references ────────────────────────────────────────────────
    ScrollView moduleGrid;
    Label moduleCount;

    // ──────────────────────────────────────────────────────────────────
    void Awake()
    {
        BindUIElements();
    }

    /// <summary>
    /// Re-query UI elements from the live visual tree.
    /// Called on Awake and every OnEnable (after SetActive rebuilds the tree).
    /// </summary>
    void BindUIElements()
    {
        var root = uiDocument.rootVisualElement;
        moduleGrid  = root.Q<ScrollView>("moduleGrid");
        moduleCount = root.Q<Label>("moduleCount");
    }

    void OnEnable()
    {
        // UIDocument rebuilds its visual tree after SetActive(false→true),
        // so re-query UI references every time we are enabled.
        BindUIElements();

        // Fetch catalog from the API; falls back to local TextAsset on failure
        StartCoroutine(LoadCatalogFromApi());
    }

    // ── Catalog loading (API) ────────────────────────────────────────
    IEnumerator LoadCatalogFromApi()
    {
        string url = apiBaseUrl.TrimEnd('/') + "/api/unity/modules/";
        Debug.Log($"[HomePageController] Fetching catalog from: {url}");

        using (var request = UnityWebRequest.Get(url))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                string json = request.downloadHandler.text;
                try
                {
                    catalog = JsonUtility.FromJson<ModuleCatalogData>(json);
                }
                catch (System.Exception ex)
                {
                    Debug.LogError($"[HomePageController] Failed to parse API catalog JSON: {ex.Message}");
                    catalog = null;
                }

                if (catalog != null && catalog.modules != null)
                {
                    Debug.Log($"[HomePageController] Loaded catalog from API with {catalog.modules.Count} module(s).");
                    BuildCards();
                    yield break;
                }
            }
            else
            {
                Debug.LogWarning($"[HomePageController] API catalog request failed: {request.error}. Falling back to local.");
            }
        }

        // Fallback: load from local TextAsset
        LoadCatalogLocal();
        BuildCards();
    }

    // ── Catalog loading (local fallback) ────────────────────────────
    void LoadCatalogLocal()
    {
        // Try inspector-assigned TextAsset, then Resources folder
        if (catalogJson == null)
        {
            catalogJson = Resources.Load<TextAsset>("Training/module_catalog");
            if (catalogJson != null)
                Debug.Log("[HomePageController] Loaded catalog TextAsset from Resources/Training/module_catalog");
        }

        if (catalogJson == null)
        {
            Debug.LogError("[HomePageController] No catalog available (API failed and no local TextAsset found).");
            return;
        }

        try
        {
            catalog = JsonUtility.FromJson<ModuleCatalogData>(catalogJson.text);
        }
        catch (System.Exception ex)
        {
            Debug.LogError($"[HomePageController] Failed to parse catalog JSON: {ex.Message}");
            catalog = null;
            return;
        }

        if (catalog == null || catalog.modules == null)
        {
            Debug.LogError("[HomePageController] Failed to parse catalog JSON.");
            return;
        }

        Debug.Log($"[HomePageController] Loaded catalog with {catalog.modules.Count} module(s).");
    }

    // ── Build module cards dynamically ───────────────────────────────
    void BuildCards()
    {
        if (catalog == null) return;

        moduleGrid.Clear();

        int count = catalog.modules.Count;
        moduleCount.text = $"{count} module{(count != 1 ? "s" : "")}";

        foreach (var mod in catalog.modules)
        {
            var card = CreateModuleCard(mod);
            moduleGrid.Add(card);
        }
    }

    VisualElement CreateModuleCard(ModuleSummaryData mod)
    {
        // Card container (acts as a clickable region)
        var card = new VisualElement();
        card.AddToClassList("module-card");

        // ── Header row: icon + title ─────────────────────────────────
        var header = new VisualElement();
        header.AddToClassList("module-card-header");

        var icon = new Label(mod.icon);
        icon.AddToClassList("module-card-icon");

        var titleArea = new VisualElement();
        titleArea.AddToClassList("module-card-title-area");

        var title = new Label(mod.title);
        title.AddToClassList("module-card-title");

        var idLabel = new Label(mod.moduleId);
        idLabel.AddToClassList("module-card-id");

        titleArea.Add(title);
        titleArea.Add(idLabel);

        header.Add(icon);
        header.Add(titleArea);
        card.Add(header);

        // ── Description ──────────────────────────────────────────────
        var desc = new Label(mod.description);
        desc.AddToClassList("module-card-description");
        card.Add(desc);

        // ── Metadata tags ────────────────────────────────────────────
        var meta = new VisualElement();
        meta.AddToClassList("module-card-meta");

        var modeTag = new Label(mod.mode);
        modeTag.AddToClassList("module-card-tag");
        modeTag.AddToClassList("module-card-tag--mode");
        meta.Add(modeTag);

        var durationTag = new Label($"{mod.estimatedDurationMin} min");
        durationTag.AddToClassList("module-card-tag");
        durationTag.AddToClassList("module-card-tag--duration");
        meta.Add(durationTag);

        var taskTag = new Label($"{mod.taskCount} tasks · {mod.stepCount} steps");
        taskTag.AddToClassList("module-card-tag");
        taskTag.AddToClassList("module-card-tag--tasks");
        meta.Add(taskTag);

        if (mod.tags != null)
        {
            foreach (var t in mod.tags)
            {
                var tag = new Label(t);
                tag.AddToClassList("module-card-tag");
                meta.Add(tag);
            }
        }

        card.Add(meta);

        // ── Start Button ─────────────────────────────────────────────
        var startBtn = new Button(() => SelectModule(mod));
        startBtn.text = "Start Module";
        startBtn.AddToClassList("module-card-start-btn");
        card.Add(startBtn);

        return card;
    }

    void SelectModule(ModuleSummaryData mod)
    {
        Debug.Log($"[HomePageController] Module selected: {mod.moduleId} — {mod.title}");
        OnModuleSelected?.Invoke(mod);
    }

    // ── Public API ───────────────────────────────────────────────────
    /// <summary>Refresh the card list (e.g. after returning from training).</summary>
    public void Refresh()
    {
        // Re-query UI elements from the live visual tree
        BindUIElements();

        if (moduleGrid == null)
        {
            Debug.LogWarning("[HomePageController] moduleGrid is null after BindUIElements — UIDocument may not have rebuilt yet.");
            return;
        }

        // Re-fetch catalog from API
        StartCoroutine(LoadCatalogFromApi());
    }

    public ModuleCatalogData GetCatalog() => catalog;
}
