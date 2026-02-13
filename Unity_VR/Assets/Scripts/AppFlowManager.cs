using UnityEngine;
using UnityEngine.UIElements;
using System.Collections;

/// <summary>
/// Top-level flow controller that manages transitions between:
///   • Home page   — module selection grid
///   • Training    — the active step-by-step training session
///
/// Attach to a manager GameObject that persists across both views.
/// Wire up the references in the Inspector.
/// </summary>
public class AppFlowManager : MonoBehaviour
{
    // ── View GameObjects ─────────────────────────────────────────────
    [Header("Views (GameObjects with UIDocument)")]
    [Tooltip("The root GameObject for the home page UI")]
    public GameObject homeView;

    [Tooltip("The root GameObject for the training session UI")]
    public GameObject trainingView;

    [Tooltip("Optional: media panel for training (disable on home)")]
    public GameObject mediaPanelView;

    [Tooltip("The root GameObject for the top panel (follow / AI buttons)")]
    public GameObject topPanelView;

    [Tooltip("The Spatial Panel Manipulator parent — grab/interaction disabled on home page")]
    public GameObject spatialPanelManipulator;

    // ── Controllers ──────────────────────────────────────────────────
    [Header("Controllers")]
    public HomePageController homePageController;
    public StepManager        stepManager;
    public TrainingDataLoader dataLoader;

    [Tooltip("Camera follow controller — forced ON when on the home page")]
    public CameraFollowController followController;

    // ── State ────────────────────────────────────────────────────────
    enum AppState { Home, Training }
    AppState currentState = AppState.Home;

    // ──────────────────────────────────────────────────────────────────
    void Awake()
    {
        // Hide top panel immediately (before Start) so it never flashes on the home page
        if (topPanelView != null)
            topPanelView.SetActive(false);

        // Disable manipulator visuals/interaction right away for home page
        SetManipulatorInteractable(false);

        // Subscribe to home page events
        if (homePageController != null)
            homePageController.OnModuleSelected += OnModuleSelected;

        // Subscribe to StepManager "return home" event
        if (stepManager != null)
            stepManager.OnReturnHome += OnReturnHome;
    }

    void Start()
    {
        ShowHome();
    }

    void OnDestroy()
    {
        if (homePageController != null)
            homePageController.OnModuleSelected -= OnModuleSelected;

        if (stepManager != null)
            stepManager.OnReturnHome -= OnReturnHome;
    }

    // ── View transitions ──────────────────────────────────────────────

    /// <summary>Show the home page, hide the training view.</summary>
    public void ShowHome()
    {
        currentState = AppState.Home;

        if (trainingView != null)  trainingView.SetActive(false);
        if (mediaPanelView != null) mediaPanelView.SetActive(false);
        if (topPanelView != null)   topPanelView.SetActive(false);
        if (homeView != null)       homeView.SetActive(true);

        // Disable the spatial panel manipulator's visuals & grab so it
        // can't be grabbed/moved on the home page (children stay active).
        SetManipulatorInteractable(false);

        // Home page UI always follows the camera
        if (followController != null)
            followController.SetFollowing(true);

        // Rebuild home page cards after UIDocument has re-created its visual tree
        StartCoroutine(RebuildHomeNextFrame());

        Debug.Log("[AppFlowManager] → Home page");
    }

    IEnumerator RebuildHomeNextFrame()
    {
        // Wait one frame so UIDocument.OnEnable() finishes rebuilding the tree
        yield return null;

        if (homePageController != null)
            homePageController.Refresh();
    }

    /// <summary>Load a module from the API and switch to the training view.</summary>
    public void StartTraining(ModuleSummaryData moduleSummary)
    {
        if (dataLoader == null || stepManager == null)
        {
            Debug.LogError("[AppFlowManager] DataLoader or StepManager not assigned!");
            return;
        }

        // Ensure StepManager uses the same TrainingDataLoader instance
        stepManager.dataLoader = dataLoader;

        // 1. Switch views immediately (training UI will show while data loads)
        currentState = AppState.Training;
        if (homeView != null)       homeView.SetActive(false);
        if (trainingView != null)   trainingView.SetActive(true);
        if (mediaPanelView != null) mediaPanelView.SetActive(true);
        if (topPanelView != null)   topPanelView.SetActive(true);

        // Re-enable the spatial panel manipulator so it can be grabbed in training
        SetManipulatorInteractable(true);

        // 2. Fetch module JSON from the API asynchronously
        Debug.Log($"[AppFlowManager] Loading module from API: {moduleSummary.jsonPath}");
        dataLoader.LoadFromApi(moduleSummary.jsonPath, (data) =>
        {
            if (data == null)
            {
                Debug.LogError($"[AppFlowManager] Failed to load module from API: {moduleSummary.jsonPath}");
                ShowHome();
                return;
            }

            // 3. Wait one frame for UIDocument visual trees to rebuild, then load
            StartCoroutine(LoadModuleNextFrame(moduleSummary.title));
        });
    }

    IEnumerator LoadModuleNextFrame(string title)
    {
        // Wait one frame so all UIDocument components finish rebuilding
        yield return null;

        stepManager.ReloadModule();

        Debug.Log($"[AppFlowManager] → Training: {title}");
    }

    // ── Event handlers ───────────────────────────────────────────────

    void OnModuleSelected(ModuleSummaryData module)
    {
        StartTraining(module);
    }

    void OnReturnHome()
    {
        ShowHome();
    }

    // ── Manipulator helpers ──────────────────────────────────────────

    /// <summary>
    /// Enable / disable the renderer, colliders and any XR interactable on
    /// the spatial panel manipulator so it can't be seen or grabbed on the
    /// home page, while keeping all child UI GameObjects active.
    /// </summary>
    void SetManipulatorInteractable(bool enabled)
    {
        if (spatialPanelManipulator == null) return;

        // Renderer (the visible affordance mesh)
        var renderer = spatialPanelManipulator.GetComponent<Renderer>();
        if (renderer != null) renderer.enabled = enabled;

        // All colliders on the manipulator itself (not children)
        foreach (var col in spatialPanelManipulator.GetComponents<Collider>())
            col.enabled = enabled;

        // Any MonoBehaviour-based XR interactable (XRGrabInteractable, etc.)
        // Using MonoBehaviour so we don't need a hard reference to XRI types.
        foreach (var mb in spatialPanelManipulator.GetComponents<MonoBehaviour>())
        {
            var t = mb.GetType();
            // Match any XR interactable class by name so this works
            // regardless of the exact XRI version / assembly.
            if (t.Name.Contains("Interactable") || t.Name.Contains("Grabbable"))
                mb.enabled = enabled;
        }

        Debug.Log($"[AppFlowManager] Manipulator interactable = {enabled}");
    }

    // ── Public API ───────────────────────────────────────────────────
    public bool IsHome()     => currentState == AppState.Home;
    public bool IsTraining() => currentState == AppState.Training;
}
