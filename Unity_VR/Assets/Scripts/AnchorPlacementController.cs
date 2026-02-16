using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit.Interactables;
using System;
using System.Collections;
using GLTFast;

/// <summary>
/// Manages the anchor placement phase at the start of each training module.
/// 
/// When a module starts, this controller:
///   1. Spawns anchor.glb in front of the user as a grabbable cube
///   2. Waits for the user to move it to their desired location
///   3. Shows a "Confirm" button so the user can lock in the position
///   4. Stores the confirmed world-space position as the origin (0,0,0)
///      for all 3D models spawned during the training steps
///
/// SETUP:
///   - Attach to a manager GameObject (e.g. the same one as AppFlowManager)
///   - Assign anchorPrefab (the anchor.glb imported as a prefab) in Inspector,
///     OR leave null to auto-load from Assets/Prefabs/anchor.glb via glTFast
///   - Wire up confirmButton (UI Toolkit Button named "anchorConfirmButton")
/// </summary>
public class AnchorPlacementController : MonoBehaviour
{
    [Header("Anchor Prefab")]
    [Tooltip("Drag the anchor.glb prefab here. If left empty, it will be loaded " +
             "from Assets/Prefabs/anchor.glb at runtime via glTFast.")]
    public GameObject anchorPrefab;

    [Header("Spawn Settings")]
    [Tooltip("Distance in front of the camera to spawn the anchor.")]
    public float spawnDistance = 2.0f;

    [Tooltip("Vertical offset from the camera's forward ray (negative = below eye level).")]
    public float heightOffset = -0.3f;

    [Tooltip("Uniform scale of the anchor cube.")]
    public float anchorScale = 0.3f;

    [Header("Visual Feedback")]
    [Tooltip("Material applied to the anchor cube. If null, a translucent blue material is created at runtime.")]
    public Material anchorMaterial;

    // ── State ────────────────────────────────────────────────────────
    /// <summary>World-space position confirmed by the user. All models offset from here.</summary>
    public Vector3 AnchorWorldOrigin { get; private set; }

    /// <summary>World-space rotation of the confirmed anchor.</summary>
    public Quaternion AnchorWorldRotation { get; private set; }

    /// <summary>True once the user has confirmed anchor placement.</summary>
    public bool IsPlaced { get; private set; }

    /// <summary>True while the anchor is visible and awaiting confirmation.</summary>
    public bool IsPlacementActive { get; private set; }

    // ── Events ───────────────────────────────────────────────────────
    /// <summary>Fired when the user confirms the anchor position.</summary>
    public event Action OnAnchorConfirmed;

    // ── Internals ────────────────────────────────────────────────────
    GameObject anchorInstance;
    GltfImport anchorGltfImport;   // kept alive if we loaded via glTFast

    // ══════════════════════════════════════════════════════════════════
    //  Public API
    // ══════════════════════════════════════════════════════════════════

    /// <summary>
    /// Begin the anchor placement phase. Spawns the anchor in front of the
    /// user's camera and waits for ConfirmPlacement() to be called.
    /// </summary>
    public void BeginPlacement()
    {
        // Clean up any previous anchor
        DestroyAnchorInstance();
        IsPlaced = false;
        IsPlacementActive = true;

        Transform cam = Camera.main != null ? Camera.main.transform : null;
        if (cam == null)
        {
            Debug.LogError("[AnchorPlacement] No main camera found — cannot spawn anchor.");
            return;
        }

        if (anchorPrefab != null)
        {
            SpawnAnchorFromPrefab(cam);
        }
        else
        {
            // Try loading from local file via glTFast
            StartCoroutine(LoadAndSpawnAnchorCoroutine(cam));
        }
    }

    /// <summary>
    /// Called when the user clicks the Confirm / OK button.
    /// Locks in the current anchor position as the world origin reference.
    /// </summary>
    public void ConfirmPlacement()
    {
        if (anchorInstance == null || !IsPlacementActive) return;

        AnchorWorldOrigin   = anchorInstance.transform.position;
        AnchorWorldRotation = anchorInstance.transform.rotation;
        IsPlaced            = true;
        IsPlacementActive   = false;

        Debug.Log($"[AnchorPlacement] Anchor confirmed at position {AnchorWorldOrigin}, rotation {AnchorWorldRotation.eulerAngles}");

        // Destroy the visual anchor — it's no longer needed
        DestroyAnchorInstance();

        OnAnchorConfirmed?.Invoke();
    }

    /// <summary>
    /// Full reset — clears the anchor origin so no offset is applied.
    /// Called when returning to the home page.
    /// </summary>
    public void ResetAnchor()
    {
        DestroyAnchorInstance();
        AnchorWorldOrigin   = Vector3.zero;
        AnchorWorldRotation = Quaternion.identity;
        IsPlaced            = false;
        IsPlacementActive   = false;

        // Dispose glTFast import if we have one
        if (anchorGltfImport != null)
        {
            anchorGltfImport.Dispose();
            anchorGltfImport = null;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  Spawn helpers
    // ══════════════════════════════════════════════════════════════════

    void SpawnAnchorFromPrefab(Transform cam)
    {
        Vector3 spawnPos = CalculateSpawnPosition(cam);

        anchorInstance = Instantiate(anchorPrefab, spawnPos, Quaternion.identity);
        anchorInstance.SetActive(true);
        anchorInstance.name = "TrainingAnchor";
        anchorInstance.transform.localScale = Vector3.one * anchorScale;

        SetupAnchorInteraction(anchorInstance);
        ApplyAnchorVisuals(anchorInstance);

        Debug.Log($"[AnchorPlacement] Anchor spawned from prefab at {spawnPos}");
    }

    IEnumerator LoadAndSpawnAnchorCoroutine(Transform cam)
    {
        // Try loading the anchor GLB from the Prefabs folder via glTFast
        string anchorPath = System.IO.Path.Combine(Application.dataPath, "Prefabs", "anchor.glb");

        if (!System.IO.File.Exists(anchorPath))
        {
            Debug.LogError($"[AnchorPlacement] anchor.glb not found at: {anchorPath}. " +
                           "Please assign anchorPrefab in the Inspector or place anchor.glb in Assets/Prefabs/.");
            IsPlacementActive = false;
            yield break;
        }

        string fileUri = "file:///" + anchorPath.Replace("\\", "/");
        Debug.Log($"[AnchorPlacement] Loading anchor from: {fileUri}");

        anchorGltfImport = new GltfImport();
        var loadTask = anchorGltfImport.Load(fileUri);

        while (!loadTask.IsCompleted)
            yield return null;

        if (loadTask.IsFaulted || !loadTask.Result)
        {
            Debug.LogError($"[AnchorPlacement] Failed to load anchor.glb: {loadTask.Exception?.Message}");
            anchorGltfImport.Dispose();
            anchorGltfImport = null;
            IsPlacementActive = false;
            yield break;
        }

        Vector3 spawnPos = CalculateSpawnPosition(cam);
        anchorInstance = new GameObject("TrainingAnchor");
        anchorInstance.transform.position = spawnPos;
        anchorInstance.transform.localScale = Vector3.one * anchorScale;

        var instantiateTask = anchorGltfImport.InstantiateMainSceneAsync(anchorInstance.transform);
        while (!instantiateTask.IsCompleted)
            yield return null;

        if (!instantiateTask.Result)
        {
            Debug.LogError("[AnchorPlacement] Failed to instantiate anchor GLB scene.");
            Destroy(anchorInstance);
            anchorInstance = null;
            anchorGltfImport.Dispose();
            anchorGltfImport = null;
            IsPlacementActive = false;
            yield break;
        }

        SetupAnchorInteraction(anchorInstance);
        ApplyAnchorVisuals(anchorInstance);

        Debug.Log($"[AnchorPlacement] Anchor spawned from GLB at {spawnPos}");
    }

    Vector3 CalculateSpawnPosition(Transform cam)
    {
        // Place anchor in front of the camera, slightly below eye level
        Vector3 forward = cam.forward;
        forward.y = 0f;   // project onto horizontal plane
        forward.Normalize();

        if (forward.sqrMagnitude < 0.01f)
            forward = Vector3.forward;

        return cam.position + forward * spawnDistance + Vector3.up * heightOffset;
    }

    // ══════════════════════════════════════════════════════════════════
    //  Make the anchor grabbable (XR Interaction Toolkit)
    // ══════════════════════════════════════════════════════════════════

    void SetupAnchorInteraction(GameObject anchor)
    {
        // Ensure a Rigidbody exists (required by XRGrabInteractable)
        var rb = anchor.GetComponent<Rigidbody>();
        if (rb == null)
            rb = anchor.AddComponent<Rigidbody>();

        rb.useGravity  = false;
        rb.isKinematic = true;   // We don't want physics simulation

        // Ensure a Collider exists (required for XR ray/direct interaction)
        var collider = anchor.GetComponentInChildren<Collider>();
        if (collider == null)
        {
            var box = anchor.AddComponent<BoxCollider>();
            // Size the collider to roughly fit the anchor
            box.size   = Vector3.one;
            box.center = Vector3.zero;
        }

        // Add XRGrabInteractable so the user can grab and reposition it
        var grab = anchor.GetComponent<XRGrabInteractable>();
        if (grab == null)
            grab = anchor.AddComponent<XRGrabInteractable>();

        grab.movementType       = XRBaseInteractable.MovementType.Instantaneous;
        grab.throwOnDetach      = false;
        grab.useDynamicAttach   = true;
    }

    // ══════════════════════════════════════════════════════════════════
    //  Visual feedback
    // ══════════════════════════════════════════════════════════════════

    void ApplyAnchorVisuals(GameObject anchor)
    {
        if (anchorMaterial == null) return;   // Use whatever material the GLB already has

        var renderers = anchor.GetComponentsInChildren<Renderer>();
        foreach (var r in renderers)
        {
            r.material = anchorMaterial;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  Cleanup
    // ══════════════════════════════════════════════════════════════════

    void DestroyAnchorInstance()
    {
        if (anchorInstance != null)
        {
            Destroy(anchorInstance);
            anchorInstance = null;
        }
    }

    void OnDestroy()
    {
        ResetAnchor();
    }
}
