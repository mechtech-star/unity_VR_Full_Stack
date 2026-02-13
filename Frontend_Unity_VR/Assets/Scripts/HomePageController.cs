using UnityEngine;
using UnityEngine.UIElements;

/// <summary>
/// Populates the home page with module cards from the catalog JSON.
/// Each card shows module info and a "Start" button that fires an event
/// picked up by AppFlowManager to transition into the training view.
/// </summary>
public class HomePageController : MonoBehaviour
{
    [Header("UI")]
    public UIDocument uiDocument;

    [Header("Catalog")]
    [Tooltip("Drag the module_catalog.json TextAsset here")]
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
        // Try to load catalog from inspector assignment first.
        // If not provided, attempt to load from Resources/Training/module_catalog
        if (catalogJson == null)
        {
            var res = Resources.Load<TextAsset>("Training/module_catalog");
            if (res != null)
            {
                catalogJson = res;
                Debug.Log("[HomePageController] Loaded catalog TextAsset from Resources/Training/module_catalog");
            }
        }

        LoadCatalog();
        BuildCards();
    }

    // ── Catalog loading ──────────────────────────────────────────────
    void LoadCatalog()
    {
        if (catalogJson == null)
        {
            Debug.LogError("[HomePageController] No catalog JSON assigned! (also attempted Resources/Training/module_catalog)");
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
    /// <summary>Refresh the card list (e.g. after catalog update or returning from training).</summary>
    public void Refresh()
    {
        // Re-query UI elements from the live visual tree
        BindUIElements();

        if (moduleGrid == null)
        {
            Debug.LogWarning("[HomePageController] moduleGrid is null after BindUIElements — UIDocument may not have rebuilt yet.");
            return;
        }

        // Reload catalog if needed
        if (catalogJson == null)
        {
            var res = Resources.Load<TextAsset>("Training/module_catalog");
            if (res != null) catalogJson = res;
        }

        LoadCatalog();
        BuildCards();
    }

    public ModuleCatalogData GetCatalog() => catalog;
}
