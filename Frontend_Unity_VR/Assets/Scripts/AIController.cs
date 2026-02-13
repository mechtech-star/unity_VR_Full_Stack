using UnityEngine;
using UnityEngine.UIElements;

public class AIController : MonoBehaviour
{
    public UIDocument uiDocument;

    VisualElement root;

    void Awake()
    {
        var rootElement = uiDocument.rootVisualElement;
        // Try to find by name first, then fall back to class selector 'root'
        root = rootElement.Q<VisualElement>("root");
        if (root == null)
            root = rootElement.Q<VisualElement>(null, "root");

        if (root == null)
        {
            Debug.LogWarning("[AIController] Could not find the root VisualElement (name or class 'root') in the assigned UIDocument.");
        }
        else
        {
            // Hide by default
            Hide();
        }
    }

    public void Show()
    {
        if (root != null)
            root.RemoveFromClassList("hidden");
    }

    public void Hide()
    {
        if (root != null)
            root.AddToClassList("hidden");
    }

    public bool IsVisible()
    {
        return root != null && !root.ClassListContains("hidden");
    }

    public void Toggle()
    {
        if (IsVisible())
            Hide();
        else
            Show();
    }
}