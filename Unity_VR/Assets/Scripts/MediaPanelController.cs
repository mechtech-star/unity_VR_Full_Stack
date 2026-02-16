using UnityEngine;
using UnityEngine.UIElements;

public class MediaPanelController : MonoBehaviour
{
    public UIDocument uiDocument;

    VisualElement mediaImage;   // Changed from Image to VisualElement — we use style.backgroundImage
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

        // Query as VisualElement — works for both <Image> and <VisualElement> tags.
        // We drive visibility via style.backgroundImage so the USS
        // -unity-background-scale-mode: scale-to-fit takes effect.
        mediaImage = root.Q("mediaImage");
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

        // Use style.backgroundImage so that the USS rule
        // -unity-background-scale-mode: scale-to-fit applies correctly.
        mediaImage.style.backgroundImage = new StyleBackground(texture);

        // Also set the Image.image property if the element is an Image
        // (belt-and-suspenders for older UXML where Image may rely on it).
        if (mediaImage is Image img)
            img.image = texture;

        // Compute a concrete width from the texture aspect ratio so the
        // element doesn't collapse to 0px when width is "auto".
        // The parent has height: 100% on the media-root; we read it.
        float aspectRatio = (float)texture.width / Mathf.Max(texture.height, 1);
        mediaImage.RegisterCallbackOnce<GeometryChangedEvent>(evt =>
        {
            float h = evt.newRect.height;
            if (h > 0f)
            {
                float w = Mathf.Min(h * aspectRatio, 1440f);
                mediaImage.style.width = w;
            }
        });

        Debug.Log($"[MediaPanelController] Showing image: {texture.name} ({texture.width}x{texture.height}, aspect={aspectRatio:F2})");
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

        // Clear the background so texture can be GC'd
        mediaImage.style.backgroundImage = StyleKeyword.None;
        mediaImage.style.width = StyleKeyword.Auto;

        if (mediaImage is Image img)
            img.image = null;
    }
}
