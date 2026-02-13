using UnityEngine;
using UnityEngine.UIElements;

/// <summary>
/// Wires up the Follow and Ask AI buttons on the top-panel UIDocument.
/// 
/// Attach this MonoBehaviour to the TopPanel GameObject (or any GO)
/// and assign the UIDocument + CameraFollowController references.
/// </summary>
public class TopPanelController : MonoBehaviour
{
    [Header("UI")]
    [Tooltip("The UIDocument that loads toppanel.uxml.")]
    public UIDocument uiDocument;

    [Header("Controllers")]
    [Tooltip("The CameraFollowController on the spatial panel parent.")]
    public CameraFollowController followController;

    [Tooltip("The AIController for the AI panel.")]
    public AIController aiController;

    // ── UI references ────────────────────────────────────────────────
    Button followButton;
    Button askAIButton;

    // USS class names for toggle visual state
    const string FollowOnClass  = "follow-button";
    const string FollowOffClass = "follow-button--off";

    const string AskAIOnClass   = "ask-button";
    const string AskAIOffClass  = "ask-button--off";

    // ── State ─────────────────────────────────────────────────────────
    bool isAIActive = false;

    // ─────────────────────────────────────────────────────────────────
    void OnEnable()
    {
        var root = uiDocument.rootVisualElement;

        followButton = root.Q<Button>("followButton");
        askAIButton  = root.Q<Button>("askAIButton");

        if (followButton != null)
            followButton.clicked += OnFollowClicked;

        if (askAIButton != null)
            askAIButton.clicked += OnAskAIClicked;

        // Listen for external follow-state changes (e.g. grab detection)
        if (followController != null)
            followController.OnFollowStateChanged += RefreshFollowVisual;

        // Initialise the visual to match current state
        RefreshFollowVisual(followController != null && followController.IsFollowing);
        RefreshAskAIVisual(isAIActive);
    }

    void OnDisable()
    {
        if (followButton != null)
            followButton.clicked -= OnFollowClicked;

        if (askAIButton != null)
            askAIButton.clicked -= OnAskAIClicked;

        if (followController != null)
            followController.OnFollowStateChanged -= RefreshFollowVisual;
    }

    // ── Button callbacks ─────────────────────────────────────────────
    void OnFollowClicked()
    {
        // Ensure we have a followController reference; try to auto-find if missing
        if (followController == null)
        {
            followController = FindFirstObjectByType<CameraFollowController>();
            if (followController == null)
            {
                Debug.LogWarning("[TopPanelController] No CameraFollowController found in scene.");
                return;
            }

            // Attach listener if not already attached
            followController.OnFollowStateChanged += RefreshFollowVisual;
        }

        // Log current state and toggle
        Debug.Log($"[TopPanelController] Follow button clicked. Current={followController.IsFollowing}");
        followController.ToggleFollowing();
    }

    void OnAskAIClicked()
    {
        // Ensure we have an aiController reference; try to auto-find if missing
        if (aiController == null)
        {
            aiController = FindFirstObjectByType<AIController>();
            if (aiController == null)
            {
                Debug.LogWarning("[TopPanelController] No AIController found in scene.");
                return;
            }
        }

        // Toggle AI state
        isAIActive = !isAIActive;
        Debug.Log($"[TopPanelController] Ask AI button clicked. AI Active={isAIActive}");

        // Update panel visibility
        if (isAIActive)
            aiController.Show();
        else
            aiController.Hide();

        // Update button visual
        RefreshAskAIVisual(isAIActive);
    }

    // ── Visual state sync ────────────────────────────────────────────
    /// <summary>
    /// Update the Follow button's USS classes and label to reflect
    /// the current follow state.
    /// </summary>
    void RefreshFollowVisual(bool isFollowing)
    {
        if (followButton == null) return;

        // Clear both classes first to avoid duplicates
        followButton.RemoveFromClassList(FollowOnClass);
        followButton.RemoveFromClassList(FollowOffClass);

        if (isFollowing)
        {
            followButton.text = "Following";
            followButton.AddToClassList(FollowOnClass);
        }
        else
        {
            followButton.text = "Follow";
            followButton.AddToClassList(FollowOffClass);
        }
    }

    /// <summary>
    /// Update the Ask AI button's USS classes to reflect
    /// the current AI state.
    /// </summary>
    void RefreshAskAIVisual(bool isActive)
    {
        if (askAIButton == null) return;

        // Clear both classes first to avoid duplicates
        askAIButton.RemoveFromClassList(AskAIOnClass);
        askAIButton.RemoveFromClassList(AskAIOffClass);

        if (isActive)
        {
            askAIButton.AddToClassList(AskAIOnClass);
        }
        else
        {
            askAIButton.AddToClassList(AskAIOffClass);
        }
    }
}