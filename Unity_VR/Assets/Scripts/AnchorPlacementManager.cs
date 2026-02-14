using UnityEngine;
using UnityEngine.UIElements;

/// <summary>
/// Manages anchor placement for 3D model origin.
/// Spawns a semi-transparent cube in front of the user that can be grabbed
/// and repositioned in VR. Once the user confirms placement, the cube's
/// position is written directly to the Spawn Point transform on
/// StepVisualController — that single transform is the origin for all models.
/// </summary>
public class AnchorPlacementManager : MonoBehaviour
{
    [Header("References")]
    [Tooltip("The XR Camera (auto-resolved from Camera.main if empty)")]
    public Transform xrCamera;

    [Tooltip("The UIDocument that contains the anchor placement overlay")]
    public UIDocument uiDocument;

    [Tooltip("The Spawn Point transform on StepVisualController. " +
             "On confirm, this transform is moved to the anchor cube's position.")]
    public Transform spawnPoint;

    [Tooltip("Yaw offset (degrees) applied to the spawnPoint when confirming placement. Use this to correct model forward-facing direction.")]
    public float spawnYawOffset = 180f;

    [Header("Anchor Appearance")]
    [Tooltip("Distance in front of the camera to spawn the anchor cube")]
    public float spawnDistance = 1.5f;

    [Tooltip("Size of the anchor cube in meters")]
    public float cubeSize = 0.15f;

    [Tooltip("Color of the anchor cube")]
    public Color anchorColor = new Color(0.38f, 0.65f, 0.98f, 0.7f); // semi-transparent blue

    [Tooltip("Color of the anchor cube when grabbed")]
    public Color anchorGrabbedColor = new Color(0.58f, 0.85f, 1f, 0.9f);

    // ── Confirmed anchor state ───────────────────────────────────────
    /// <summary>True after the user has confirmed anchor placement.</summary>
    public bool IsAnchored { get; private set; }

    /// <summary>True while the anchor placement UI is active.</summary>
    public bool IsPlacing { get; private set; }

    // ── Events ───────────────────────────────────────────────────────
    /// <summary>Fired when the user confirms anchor placement.</summary>
    public event System.Action OnAnchorConfirmed;

    /// <summary>Fired when the anchor is reset (user wants to reposition).</summary>
    public event System.Action OnAnchorReset;

    // ── Runtime state ────────────────────────────────────────────────
    GameObject anchorCube;
    Renderer anchorRenderer;
    Material anchorMaterial;

    // UI elements
    VisualElement anchorOverlay;
    Button confirmButton;
    Button resetButton;
    Label anchorInstructions;
    Label anchorPositionLabel;

    // Pulsing animation state
    float pulseTime;

    // ─────────────────────────────────────────────────────────────────
    void Awake()
    {
        if (xrCamera == null)
        {
            var cam = Camera.main;
            if (cam != null) xrCamera = cam.transform;
        }
    }

    void Update()
    {
        if (!IsPlacing || anchorCube == null) return;

        // Pulse the anchor cube so it's visually obvious
        pulseTime += Time.deltaTime;
        float pulse = 0.85f + 0.15f * Mathf.Sin(pulseTime * 3f);
        anchorCube.transform.localScale = Vector3.one * cubeSize * pulse;

        // Billboard: front face always faces the user (no rotation)
        if (xrCamera != null)
        {
            Vector3 lookDir = anchorCube.transform.position - xrCamera.position;
            lookDir.y = 0f; // keep upright
            if (lookDir.sqrMagnitude > 0.001f)
                anchorCube.transform.rotation = Quaternion.LookRotation(lookDir, Vector3.up);
        }

        // Update position readout in UI
        if (anchorPositionLabel != null)
        {
            Vector3 p = anchorCube.transform.position;
            anchorPositionLabel.text = $"Position: ({p.x:F2}, {p.y:F2}, {p.z:F2})";
        }
    }

    // ── Public API ───────────────────────────────────────────────────

    /// <summary>
    /// Start the anchor placement flow. Spawns the cube in front of
    /// the user and shows the placement UI overlay.
    /// </summary>
    public void BeginPlacement()
    {
        IsPlacing = true;
        IsAnchored = false;

        SpawnAnchorCube();
        BindUI();
        ShowOverlay(true);

        Debug.Log("[AnchorPlacementManager] Anchor placement started — grab and position the cube.");
    }

    /// <summary>
    /// Confirm the current cube position as the model origin.
    /// Destroys the cube and hides the overlay.
    /// </summary>
    public void ConfirmPlacement()
    {
        if (anchorCube == null)
        {
            Debug.LogWarning("[AnchorPlacementManager] No anchor cube to confirm.");
            return;
        }

        // Move the spawnPoint to the anchor cube's position and
        // transfer only the Y-axis rotation (the billboard facing direction)
        // so models are oriented toward the user.
        if (spawnPoint != null)
        {
            spawnPoint.position = anchorCube.transform.position;

            // Extract Y rotation from the anchor (billboard kept it upright)
            float yAngle = anchorCube.transform.eulerAngles.y;
            // Apply configurable yaw offset to correct model forward direction
            float appliedYaw = yAngle + spawnYawOffset;
            spawnPoint.rotation = Quaternion.Euler(0f, appliedYaw, 0f);

            Debug.Log($"[AnchorPlacementManager] Spawn point moved to {spawnPoint.position}, Y rotation={appliedYaw:F1}° (anchorY={yAngle:F1}°, offset={spawnYawOffset}°)");
        }
        else
        {
            Debug.LogWarning("[AnchorPlacementManager] No spawnPoint assigned — anchor position won't transfer.");
        }

        IsAnchored = true;
        IsPlacing = false;

        Debug.Log($"[AnchorPlacementManager] Anchor confirmed at {anchorCube.transform.position}");

        // Clean up the placement cube
        DestroyAnchorCube();
        ShowOverlay(false);

        OnAnchorConfirmed?.Invoke();
    }

    /// <summary>
    /// Reset the anchor so the user can reposition.
    /// If called during placement, re-spawns the cube.
    /// If called after confirmation, re-enters placement mode.
    /// </summary>
    public void ResetAnchor()
    {
        IsAnchored = false;
        DestroyAnchorCube();
        SpawnAnchorCube();
        IsPlacing = true;
        ShowOverlay(true);

        Debug.Log("[AnchorPlacementManager] Anchor reset — reposition the cube.");
        OnAnchorReset?.Invoke();
    }

    /// <summary>
    /// Full cleanup — destroys the cube, hides overlay, resets state.
    /// Called when returning to home page.
    /// </summary>
    public void Cleanup()
    {
        IsPlacing = false;
        IsAnchored = false;
        DestroyAnchorCube();
        ShowOverlay(false);
    }

    // ── Cube creation ────────────────────────────────────────────────

    void SpawnAnchorCube()
    {
        DestroyAnchorCube();

        if (xrCamera == null)
        {
            var cam = Camera.main;
            if (cam != null) xrCamera = cam.transform;
        }

        // Calculate spawn position in front of the user
        Vector3 camForward = xrCamera != null ? xrCamera.forward : Vector3.forward;
        camForward.y = 0f;
        if (camForward.sqrMagnitude < 0.001f)
            camForward = Vector3.forward;
        camForward.Normalize();

        Vector3 spawnPos = (xrCamera != null ? xrCamera.position : Vector3.zero)
                         + camForward * spawnDistance
                         + Vector3.up * -0.3f; // slightly below eye level

        // Create the cube primitive
        anchorCube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        anchorCube.name = "AnchorPlacementCube";
        anchorCube.transform.position = spawnPos;
        anchorCube.transform.localScale = Vector3.one * cubeSize;

        // Semi-transparent material
        anchorRenderer = anchorCube.GetComponent<Renderer>();
        anchorMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        if (anchorMaterial != null)
        {
            // Enable transparency
            anchorMaterial.SetFloat("_Surface", 1); // Transparent
            anchorMaterial.SetFloat("_Blend", 0);   // Alpha
            anchorMaterial.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            anchorMaterial.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            anchorMaterial.SetInt("_ZWrite", 0);
            anchorMaterial.DisableKeyword("_ALPHATEST_ON");
            anchorMaterial.EnableKeyword("_ALPHABLEND_ON");
            anchorMaterial.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            anchorMaterial.renderQueue = 3000;
            anchorMaterial.color = anchorColor;
            anchorRenderer.material = anchorMaterial;
        }

        // Add a small wireframe-like edge glow via a child outline cube
        CreateOutlineCube(anchorCube.transform);

        // Rigidbody (kinematic so it floats in place)
        var rb = anchorCube.AddComponent<Rigidbody>();
        rb.isKinematic = true;
        rb.useGravity = false;

        // Add XR Grab Interactable for VR hand/controller grabbing
        // Using reflection-free approach: add the component by type name
        // so we don't need a hard assembly reference to XRI
        AddXRGrabInteractable(anchorCube);

        pulseTime = 0f;

        Debug.Log($"[AnchorPlacementManager] Anchor cube spawned at {spawnPos}");
    }

    void CreateOutlineCube(Transform parent)
    {
        var outline = GameObject.CreatePrimitive(PrimitiveType.Cube);
        outline.name = "AnchorOutline";
        outline.transform.SetParent(parent, false);
        outline.transform.localScale = Vector3.one * 1.08f; // slightly larger

        // Destroy the collider on the outline (we only want the visual)
        var col = outline.GetComponent<Collider>();
        if (col != null) Destroy(col);

        var outlineMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        if (outlineMat != null)
        {
            outlineMat.SetFloat("_Surface", 1);
            outlineMat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            outlineMat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            outlineMat.SetInt("_ZWrite", 0);
            outlineMat.renderQueue = 2999;
            outlineMat.color = new Color(anchorColor.r, anchorColor.g, anchorColor.b, 0.15f);
            outline.GetComponent<Renderer>().material = outlineMat;
        }
    }

    /// <summary>
    /// Dynamically add XRGrabInteractable to the anchor cube.
    /// Uses type-name lookup to avoid hard assembly references.
    /// Falls back gracefully if XRI is not available.
    /// </summary>
    void AddXRGrabInteractable(GameObject target)
    {
        // Try to find XRGrabInteractable type from loaded assemblies
        System.Type grabType = null;
        foreach (var asm in System.AppDomain.CurrentDomain.GetAssemblies())
        {
            grabType = asm.GetType("UnityEngine.XR.Interaction.Toolkit.Interactables.XRGrabInteractable");
            if (grabType != null) break;

            // Fallback for older XRI versions
            grabType = asm.GetType("UnityEngine.XR.Interaction.Toolkit.XRGrabInteractable");
            if (grabType != null) break;
        }

        if (grabType != null)
        {
            var interactable = target.AddComponent(grabType);

            // Configure via reflection:
            // - throwOnDetach = false  (don't fling the cube)
            // - trackPosition = true
            // - trackRotation = false (cube always faces user via billboard)
            // - movementType = Instantaneous for snappy tracking
            SetPropertySafe(interactable, "throwOnDetach", false);
            SetPropertySafe(interactable, "trackPosition", true);
            SetPropertySafe(interactable, "trackRotation", false);

            // movementType: 0=VelocityTracking, 1=Kinematic, 2=Instantaneous
            // We want Instantaneous for snappy tracking
            var movementProp = grabType.GetProperty("movementType");
            if (movementProp != null)
            {
                var enumType = movementProp.PropertyType;
                var enumValues = System.Enum.GetValues(enumType);
                if (enumValues.Length > 2)
                    movementProp.SetValue(interactable, enumValues.GetValue(2));
            }

            Debug.Log("[AnchorPlacementManager] XRGrabInteractable added to anchor cube.");
        }
        else
        {
            Debug.LogWarning(
                "[AnchorPlacementManager] XRGrabInteractable not found. " +
                "The anchor cube won't be directly grabbable in VR. " +
                "You can still reposition it via the Reset button.");
        }
    }

    void SetPropertySafe(object target, string propertyName, object value)
    {
        var prop = target.GetType().GetProperty(propertyName);
        if (prop != null && prop.CanWrite)
        {
            try { prop.SetValue(target, value); }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[AnchorPlacementManager] Could not set {propertyName}: {e.Message}");
            }
        }
    }

    void DestroyAnchorCube()
    {
        if (anchorCube != null)
        {
            Destroy(anchorCube);
            anchorCube = null;
        }
        if (anchorMaterial != null)
        {
            Destroy(anchorMaterial);
            anchorMaterial = null;
        }
    }

    // ── UI Binding ───────────────────────────────────────────────────

    void BindUI()
    {
        if (uiDocument == null) return;

        var root = uiDocument.rootVisualElement;
        if (root == null) return;

        anchorOverlay = root.Q<VisualElement>("anchorOverlay");
        confirmButton = root.Q<Button>("anchorConfirmButton");
        resetButton = root.Q<Button>("anchorResetButton");
        anchorInstructions = root.Q<Label>("anchorInstructions");
        anchorPositionLabel = root.Q<Label>("anchorPositionLabel");

        if (confirmButton != null)
        {
            confirmButton.clicked -= ConfirmPlacement;
            confirmButton.clicked += ConfirmPlacement;
        }

        if (resetButton != null)
        {
            resetButton.clicked -= ResetAnchor;
            resetButton.clicked += ResetAnchor;
        }
    }

    void ShowOverlay(bool show)
    {
        if (anchorOverlay == null) return;

        if (show)
            anchorOverlay.RemoveFromClassList("hidden");
        else
            anchorOverlay.AddToClassList("hidden");
    }

    // ── Cleanup ──────────────────────────────────────────────────────

    void OnDestroy()
    {
        DestroyAnchorCube();
    }
}
