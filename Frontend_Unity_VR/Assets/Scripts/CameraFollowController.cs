using UnityEngine;

/// <summary>
/// Smoothly keeps a target transform in front of the XR camera.
/// Disables itself automatically when the object is grabbed
/// (i.e. when an XR interaction moves the transform externally).
/// Re-enable by calling SetFollowing(true).
/// </summary>
public class CameraFollowController : MonoBehaviour
{
    [Header("References")]
    [Tooltip("The transform to move in front of the camera. " +
             "Defaults to this GameObject's transform if left empty.")]
    public Transform target;

    [Tooltip("The XR Camera transform (usually Main Camera under XR Origin). " +
             "Auto-resolved from Camera.main if left empty.")]
    public Transform xrCamera;

    [Header("Positioning")]
    [Tooltip("Distance in front of the camera.")]
    public float followDistance = 1.5f;

    [Tooltip("Vertical offset from the camera's forward direction.")]
    public float heightOffset = -0.2f;

    [Header("Smoothing")]
    [Tooltip("How quickly the panel lerps to the target position (higher = snappier).")]
    public float positionSmoothSpeed = 5f;

    [Tooltip("How quickly the panel slerps to face the camera (higher = snappier).")]
    public float rotationSmoothSpeed = 5f;

    [Header("Grab Detection")]
    [Tooltip("If the panel moves more than this distance in a single frame " +
             "without follow being the cause, assume it was grabbed and disable follow.")]
    public float grabDetectionThreshold = 0.002f;

    // ── Runtime state ────────────────────────────────────────────────
    bool isFollowing = true;
    Vector3 lastPosition;

    // If true, the follow was disabled due to a user grab/manual move.
    // Must be re-enabled explicitly (e.g. via UI button).
    bool disabledByGrab = false;

    /// <summary>Is the controller currently following the camera?</summary>
    public bool IsFollowing => isFollowing;

    // ── Events ───────────────────────────────────────────────────────
    /// Fired whenever the follow state changes (true = following).
    public event System.Action<bool> OnFollowStateChanged;

    // ─────────────────────────────────────────────────────────────────
    void Awake()
    {
        if (target == null)
            target = transform;

        if (xrCamera == null)
        {
            var cam = Camera.main;
            if (cam != null)
                xrCamera = cam.transform;
        }

        lastPosition = target.position;
    }

    void LateUpdate()
    {
        if (xrCamera == null || target == null) return;

        // ── Grab detection ───────────────────────────────────────────
        // lastPosition was recorded AFTER the follow-move last frame,
        // so any delta here must be from an external source (XR grab).
        if (isFollowing)
        {
            float externalDelta = Vector3.Distance(target.position, lastPosition);
            if (externalDelta > grabDetectionThreshold)
            {
                NotifyExternalMoveDetected();
                return;
            }
        }

        if (!isFollowing)
        {
            lastPosition = target.position;
            return;
        }

        // ── Compute desired pose ─────────────────────────────────────
        Vector3 camForward = xrCamera.forward;
        camForward.y = 0f;                       // keep panel level
        if (camForward.sqrMagnitude < 0.001f)    // edge case: looking straight up/down
            camForward = xrCamera.up.y >= 0 ? Vector3.forward : Vector3.back;
        camForward.Normalize();

        Vector3 desiredPosition = xrCamera.position
                                + camForward * followDistance
                                + Vector3.up * heightOffset;

        // Face the camera (panel looks back at the user)
        Quaternion desiredRotation = Quaternion.LookRotation(
            camForward, Vector3.up);

        // ── Smoothly interpolate ─────────────────────────────────────
        float dt = Time.deltaTime;
        target.position = Vector3.Lerp(
            target.position, desiredPosition, dt * positionSmoothSpeed);

        target.rotation = Quaternion.Slerp(
            target.rotation, desiredRotation, dt * rotationSmoothSpeed);

        // Record position AFTER our move so next frame's delta
        // only reflects external changes.
        lastPosition = target.position;
    }

    /// <summary>
    /// Called when an external movement (grab/place) is detected.
    /// Disables following and marks the controller as disabledByGrab so it
    /// won't be re-enabled by other automatic logic.
    /// </summary>
    void NotifyExternalMoveDetected()
    {
        disabledByGrab = true;
        SetFollowing(false);
        Debug.Log("[CameraFollowController] External move detected — follow disabled by grab.");
    }

    // ── Public API ───────────────────────────────────────────────────
    /// <summary>Enable or disable camera following.</summary>
    public void SetFollowing(bool follow)
    {
        if (isFollowing == follow) return;

        isFollowing = follow;

        if (isFollowing)
        {
            // If enabling following explicitly, clear the disabledByGrab flag
            // so subsequent grabs can re-disable it again.
            disabledByGrab = false;

            // Snap lastPosition so we don't false-detect a grab on the
            // first frame after re-enabling.
            lastPosition = target.position;
        }

        Debug.Log($"[CameraFollowController] Follow = {isFollowing} (disabledByGrab={disabledByGrab})");
        OnFollowStateChanged?.Invoke(isFollowing);
    }

    /// Toggle the current state.
    public void ToggleFollowing() => SetFollowing(!isFollowing);
}
