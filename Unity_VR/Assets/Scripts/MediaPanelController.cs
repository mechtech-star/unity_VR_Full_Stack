using UnityEngine;
using UnityEngine.UIElements;

public class MediaPanelController : MonoBehaviour
{
    public UIDocument uiDocument;

    Image mediaImage;
    VisualElement videoContainer;

    void Awake()
    {
        BindUIElements();
    }

    void OnEnable()
    {
        // Re-bind when the view is re-enabled. UIDocument rebuilds its visual tree
        // after SetActive(false -> true), so cached references can become stale.
        BindUIElements();
    }

    void BindUIElements()
    {
        if (uiDocument == null)
        {
            Debug.LogError("[MediaPanelController] UIDocument is not assigned.");
            return;
        }

        var root = uiDocument.rootVisualElement;
        if (root == null)
        {
            Debug.LogWarning("[MediaPanelController] rootVisualElement is null — UIDocument may not have rebuilt yet.");
            return;
        }

        mediaImage = root.Q<Image>("mediaImage");
        videoContainer = root.Q<VisualElement>("videoContainer");

        if (mediaImage == null)
            Debug.LogWarning("[MediaPanelController] Could not find 'mediaImage' in UXML.");
        if (videoContainer == null)
            Debug.LogWarning("[MediaPanelController] Could not find 'videoContainer' in UXML.");
    }

    public void ShowImage(Texture2D texture)
    {
        // Always re-query from the live visual tree (guards against stale refs
        // after UIDocument rebuilds from SetActive toggle)
        BindUIElements();

        if (mediaImage == null || videoContainer == null)
        {
            Debug.LogWarning("[MediaPanelController] ShowImage skipped — UI elements not found after BindUIElements.");
            return;
        }

        if (texture == null)
        {
            Debug.LogWarning("[MediaPanelController] ShowImage called with null texture.");
            Hide();
            return;
        }

        videoContainer.style.display = DisplayStyle.None;
        videoContainer.AddToClassList("hidden");

        mediaImage.RemoveFromClassList("hidden");
        mediaImage.style.display = DisplayStyle.Flex;
        mediaImage.image = texture;

        Debug.Log($"[MediaPanelController] Showing image: {texture.name} ({texture.width}x{texture.height})");
    }

    public void Hide()
    {
        BindUIElements();

        if (mediaImage == null || videoContainer == null)
            return;

        mediaImage.style.display = DisplayStyle.None;
        videoContainer.style.display = DisplayStyle.None;

        mediaImage.AddToClassList("hidden");
        videoContainer.AddToClassList("hidden");
    }
}
