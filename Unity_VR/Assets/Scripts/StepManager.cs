using UnityEngine;
using UnityEngine.UIElements;
using System.Collections.Generic;

/// <summary>
/// Drives the training flow.
/// All step / task data now comes from the training JSON via TrainingDataLoader.
/// Assets (prefabs, textures) are resolved at load-time through Resources.Load.
/// During production the loader can be swapped to fetch from a server.
/// </summary>
public class StepManager : MonoBehaviour
{
    [Header("UI")]
    public UIDocument uiDocument;

    [Header("Controllers")]
    public StepVisualController stepVisualController;
    public MediaPanelController mediaPanelController;

    [Header("Data")]
    public TrainingDataLoader dataLoader;

    // ── Events ───────────────────────────────────────────────────────
    /// <summary>Fired when the user wants to return to the home page.</summary>
    public event System.Action OnReturnHome;

    // ── UI references ────────────────────────────────────────────────
    Label titleLabel;
    Label contentText;
    Label moduleTitle;
    Label stepCounter;
    Button backButton;
    Button nextButton;
    Button menuButton;
    Button closeMenuButton;
    Button homeButton;
    VisualElement menuOverlay;
    VisualElement footer;
    VisualElement questionContainer;
    ScrollView taskTree;

    // ── Runtime state ────────────────────────────────────────────────
    TrainingModuleData moduleData;
    int currentTaskIndex = 0;
    int currentStepIndex = 0;

    // Flat list for global step numbering ("Step 3 / 10")
    List<(int taskIdx, int stepIdx)> flatStepMap = new List<(int, int)>();

    // ─────────────────────────────────────────────────────────────────
    void Awake()
    {
        BindUIElements();
    }

    /// <summary>
    /// Re-query every UI element from the LIVE rootVisualElement and
    /// re-wire button click handlers.
    /// Must be called after the UIDocument's visual tree is rebuilt
    /// (e.g. after SetActive(true) re-instantiates from UXML).
    /// </summary>
    void BindUIElements()
    {
        var root = uiDocument.rootVisualElement;

        titleLabel         = root.Q<Label>("titleLabel");
        contentText        = root.Q<Label>("contentText");
        backButton         = root.Q<Button>("backButton");
        nextButton         = root.Q<Button>("nextButton");
        menuButton         = root.Q<Button>("menuButton");
        closeMenuButton    = root.Q<Button>("closeMenuButton");
        menuOverlay        = root.Q<VisualElement>("menuOverlay");
        footer             = root.Q<VisualElement>("footer");
        questionContainer  = root.Q<VisualElement>("questionContainer");
        taskTree           = root.Q<ScrollView>("taskTree");
        homeButton         = root.Q<Button>("homeButton");

        // If the home button isn't in this UIDocument's tree (we moved it
        // to a shared top panel), attempt to find it in other UIDocuments
        // in the scene so existing handlers continue to work.
        if (homeButton == null)
        {
            var docs = FindObjectsOfType<UIDocument>();
            foreach (var doc in docs)
            {
                if (doc == null) continue;
                if (doc == uiDocument) continue;
                var candidate = doc.rootVisualElement.Q<Button>("homeButton");
                if (candidate != null)
                {
                    homeButton = candidate;
                    Debug.Log("[StepManager] Found homeButton in another UIDocument.");
                    break;
                }
            }
        }

        // Unsubscribe first to avoid duplicate handlers on re-bind
        if (backButton != null)      { backButton.clicked      -= GoBack;      backButton.clicked      += GoBack; }
        if (nextButton != null)      { nextButton.clicked      -= GoNext;      nextButton.clicked      += GoNext; }
        if (menuButton != null)      { menuButton.clicked      -= OpenMenu;    menuButton.clicked      += OpenMenu; }
        if (closeMenuButton != null) { closeMenuButton.clicked -= CloseMenu;   closeMenuButton.clicked += CloseMenu; }
        if (homeButton != null)      { homeButton.clicked      -= ReturnHome;  homeButton.clicked      += ReturnHome; }

        Debug.Log("[StepManager] UI elements bound to live visual tree.");
    }

    void Start()
    {
        // Initial load is now triggered by AppFlowManager via ReloadModule().
        // If StepManager is used standalone (no AppFlowManager), it still auto-loads.
        if (dataLoader != null && dataLoader.trainingJson != null && moduleData == null)
        {
            LoadTrainingData();
            ShowCurrentStep();
        }
    }

    /// <summary>
    /// Called by AppFlowManager when a module is selected from the home page.
    /// Resets state and loads the new training data.
    /// </summary>
    public void ReloadModule()
    {
        // ── Re-bind UI elements ─────────────────────────────────────
        // UIDocument rebuilds its visual tree when the GameObject is
        // re-enabled after SetActive(false→true). The old cached
        // references become stale, so we must re-query them.
        BindUIElements();

        // Reset navigation state
        currentTaskIndex = 0;
        currentStepIndex = 0;

        // Note: asset caches are NOT cleared here — they were just populated
        // by TrainingDataLoader.PreloadAssetsCoroutine() before this method
        // was called. Full cleanup happens in ReturnHome() instead.

        // Clear any existing 3D model
        if (stepVisualController != null)
            stepVisualController.Clear();

        // Clear media panel
        if (mediaPanelController != null)
            mediaPanelController.Hide();

        // Load new data and display
        LoadTrainingData();
        ShowCurrentStep();
    }

    /// <summary>Return to the home page.</summary>
    void ReturnHome()
    {
        // Clean up current training visuals
        if (stepVisualController != null)
            stepVisualController.Clear();
        if (mediaPanelController != null)
            mediaPanelController.Hide();

        // Full cleanup of loaded data and asset caches
        if (dataLoader != null)
            dataLoader.ClearCaches();

        moduleData = null;
        OnReturnHome?.Invoke();
    }

    // ── Data loading ─────────────────────────────────────────────────
    void LoadTrainingData()
    {
        if (dataLoader == null)
        {
            Debug.LogError("[StepManager] No TrainingDataLoader assigned!");
            return;
        }

        // If data was already loaded via API (ModuleData is populated), use it directly.
        // Otherwise fall back to parsing the local TextAsset.
        if (dataLoader.ModuleData != null)
        {
            Debug.Log("[StepManager] Using pre-loaded module data from API.");
            moduleData = dataLoader.ModuleData;
        }
        else if (dataLoader.trainingJson != null)
        {
            Debug.Log($"[StepManager] Loading module from local TextAsset: {dataLoader.trainingJson.name}");
            moduleData = dataLoader.Load();
        }
        else
        {
            Debug.LogError("[StepManager] No training data available — neither API data nor local TextAsset is set.");
            return;
        }

        if (moduleData == null) return;

        // Build a flat index so we can display "Step N / Total"
        flatStepMap.Clear();
        for (int t = 0; t < moduleData.tasks.Count; t++)
            for (int s = 0; s < moduleData.tasks[t].steps.Count; s++)
                flatStepMap.Add((t, s));

        Debug.Log($"[StepManager] Module '{moduleData.title}' ready — " +
                  $"{moduleData.tasks.Count} task(s), {flatStepMap.Count} total step(s).");
    }

    // ── Display ──────────────────────────────────────────────────────
    void ShowCurrentStep()
    {
        if (moduleData == null) return;

        TrainingTaskData task = moduleData.tasks[currentTaskIndex];
        TrainingStepData step = task.steps[currentStepIndex];

        // Title bar
        titleLabel.text = $"{task.taskTitle} — {step.title}";

        // Description body
        contentText.text = step.description;

        // ── 3D model ─────────────────────────────────────────────────
        if (stepVisualController != null)
        {
            if (step.model != null && !string.IsNullOrEmpty(step.model.path))
            {
                GameObject prefab = dataLoader.ResolvePrefab(step.model.path);
                SpawnData spawn   = step.model.spawn;
                AnimationClip[] clips = dataLoader.ResolveAnimationClips(step.model.path);

                stepVisualController.ShowStepVisual(
                    prefab,
                    step.model.animation,
                    spawn != null ? spawn.Position : Vector3.zero,
                    spawn != null ? spawn.Rotation : Quaternion.identity,
                    spawn != null ? spawn.Scale    : 1f,
                    step.model.path,
                    clips
                );
            }
            else
            {
                stepVisualController.Clear();
            }
        }

        // ── 2D media (image / video) ─────────────────────────────────
        if (mediaPanelController != null)
        {
            if (step.media != null && !string.IsNullOrEmpty(step.media.path))
            {
                Debug.Log($"[StepManager] Media: type={step.media.type}, path={step.media.path}");

                if (step.media.type == "image")
                {
                    Texture2D tex = dataLoader.ResolveTexture(step.media.path);
                    Debug.Log($"[StepManager] ResolveTexture result: {(tex != null ? $"{tex.width}x{tex.height}" : "NULL")}");
                    if (tex != null)
                        mediaPanelController.ShowImage(tex);
                    else
                        mediaPanelController.Hide();
                }
                else if (step.media.type == "video")
                {
                    // Video playback: pass the full URL to the media panel
                    string videoUrl = step.media.path;
                    if (videoUrl.StartsWith("/"))
                        videoUrl = dataLoader.apiBaseUrl.TrimEnd('/') + videoUrl;
                    Debug.Log($"[StepManager] Video URL: {videoUrl}");
                    // TODO: implement mediaPanelController.ShowVideo(videoUrl)
                    mediaPanelController.Hide();
                }
                else
                {
                    mediaPanelController.Hide();
                }
            }
            else
            {
                Debug.Log("[StepManager] No media for this step.");
                mediaPanelController.Hide();
            }
        }
        else
        {
            Debug.LogWarning("[StepManager] mediaPanelController is NULL — media panel will not display.");
        }

        // ── Question step (branching choices) ────────────────────────
        bool isQuestion = step.instructionType == "question"
                       && step.choices != null
                       && step.choices.Count > 0;

        if (isQuestion)
        {
            // Hide the standard footer for question steps
            footer.style.display = DisplayStyle.None;

            // Build choice buttons inside the body
            questionContainer.Clear();
            questionContainer.RemoveFromClassList("hidden");

            foreach (var choice in step.choices)
            {
                int targetStepId = choice.goToStepId;
                var btn = new Button(() => JumpToStepById(targetStepId));
                btn.text = choice.label;
                btn.AddToClassList("question-choice-button");
                questionContainer.Add(btn);
            }
        }
        else
        {
            // Normal step — show footer, hide question container
            footer.style.display = DisplayStyle.Flex;
            questionContainer.Clear();
            questionContainer.AddToClassList("hidden");

            // ── Nav button visibility ───────────────────────────────
            backButton.style.display =
                (currentTaskIndex == 0 && currentStepIndex == 0)
                    ? DisplayStyle.None
                    : DisplayStyle.Flex;

            bool isLast = (currentTaskIndex == moduleData.tasks.Count - 1)
                       && (currentStepIndex == task.steps.Count - 1);

            nextButton.text = isLast ? "Finish" : "Next";

            // Swap click handler: "Finish" returns home; otherwise navigate next
            nextButton.clicked -= GoNext;
            nextButton.clicked -= ReturnHome;

            if (isLast)
                nextButton.clicked += ReturnHome;
            else
                nextButton.clicked += GoNext;
        }

        // Log step metadata for debugging
        LogStepInfo(step);
    }

    void LogStepInfo(TrainingStepData step)
    {
        string info = $"[Step {step.stepId}] type={step.instructionType}";

        if (step.completionCriteria != null)
            info += $"  completion={step.completionCriteria.type}:{step.completionCriteria.value}";

        if (step.interactions != null)
            info += $"  action={step.interactions.requiredAction}" +
                    $"  target={step.interactions.target}";

        Debug.Log(info);
    }

    // ── Task-tree side-menu ──────────────────────────────────────────
    void BuildTaskTree()
    {
        taskTree.Clear();

        for (int t = 0; t < moduleData.tasks.Count; t++)
        {
            int taskIndex = t;
            var taskData  = moduleData.tasks[t];

            var taskLabel = new Label(taskData.taskTitle);
            taskLabel.AddToClassList("task-header");

            if (t == currentTaskIndex)
                taskLabel.AddToClassList("task-header--active");

            taskTree.Add(taskLabel);

            for (int s = 0; s < taskData.steps.Count; s++)
            {
                int stepIndex = s;

                var stepButton = new Button(() => JumpToStep(taskIndex, stepIndex));
                stepButton.text = $"  • {taskData.steps[s].title}";
                stepButton.AddToClassList("step-item");

                if (t == currentTaskIndex && s == currentStepIndex)
                    stepButton.AddToClassList("step-item--active");

                taskTree.Add(stepButton);
            }
        }
    }

    void JumpToStep(int taskIndex, int stepIndex)
    {
        currentTaskIndex = taskIndex;
        currentStepIndex = stepIndex;
        CloseMenu();
        ShowCurrentStep();
    }

    void OpenMenu()
    {
        BuildTaskTree();
        menuOverlay.RemoveFromClassList("hidden");
    }

    void CloseMenu()
    {
        menuOverlay.AddToClassList("hidden");
    }

    // ── Navigation ───────────────────────────────────────────────────
    void GoNext()
    {
        var task = moduleData.tasks[currentTaskIndex];

        if (currentStepIndex < task.steps.Count - 1)
        {
            currentStepIndex++;
        }
        else if (currentTaskIndex < moduleData.tasks.Count - 1)
        {
            currentTaskIndex++;
            currentStepIndex = 0;
        }
        else
        {
            Debug.Log("[StepManager] All tasks completed!");
            return;
        }

        ShowCurrentStep();
    }

    void GoBack()
    {
        if (currentStepIndex > 0)
        {
            currentStepIndex--;
        }
        else if (currentTaskIndex > 0)
        {
            currentTaskIndex--;
            currentStepIndex = moduleData.tasks[currentTaskIndex].steps.Count - 1;
        }

        ShowCurrentStep();
    }

    // ── Step-ID lookup ────────────────────────────────────────────────
    /// <summary>
    /// Jump to a step by its global stepId (from the JSON).
    /// Used by question-choice buttons for branching navigation.
    /// </summary>
    void JumpToStepById(int stepId)
    {
        for (int t = 0; t < moduleData.tasks.Count; t++)
        {
            for (int s = 0; s < moduleData.tasks[t].steps.Count; s++)
            {
                if (moduleData.tasks[t].steps[s].stepId == stepId)
                {
                    currentTaskIndex = t;
                    currentStepIndex = s;
                    ShowCurrentStep();
                    return;
                }
            }
        }

        Debug.LogWarning($"[StepManager] stepId {stepId} not found — staying on current step.");
    }

    // ── Public accessors (for other systems) ─────────────────────────
    public TrainingStepData GetCurrentStepData()
    {
        if (moduleData == null) return null;
        return moduleData.tasks[currentTaskIndex].steps[currentStepIndex];
    }

    public TrainingModuleData GetModuleData() => moduleData;
}
