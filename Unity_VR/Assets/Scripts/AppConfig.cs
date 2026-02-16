using UnityEngine;

[CreateAssetMenu(fileName = "app_config", menuName = "Config/AppConfig")]
public class AppConfig : ScriptableObject
{
    [Tooltip("Primary backend base URL — works on PC (localhost). On Quest, falls back to the LAN IP.")]
    public string apiBaseUrl = "http://localhost:8000";

    [Tooltip("Fallback URL — the PC's LAN IP, reachable from Quest over Wi-Fi")]
    public string apiBaseUrlFallback = "http://192.168.29.239:8000";
}

/// <summary>
/// Static provider that exposes the AppConfig values and a simple
/// resolution policy: inspector override -> AppConfig asset in Resources -> sensible default.
/// Place an AppConfig asset at Assets/Resources/app_config.asset to change the value used at runtime.
/// </summary>
public static class ApiConfigProvider
{
    const string resourcePath = "app_config";
    static AppConfig _cached;

    static AppConfig Config
    {
        get
        {
            if (_cached == null)
                _cached = Resources.Load<AppConfig>(resourcePath);
            return _cached;
        }
    }

    public static string GetApiBaseUrl(string overrideValue = null)
    {
        if (!string.IsNullOrEmpty(overrideValue))
            return overrideValue;

        var cfg = Config;
        if (cfg != null && !string.IsNullOrEmpty(cfg.apiBaseUrl))
            return cfg.apiBaseUrl;

        return "http://localhost:8000";
    }

    public static string GetApiBaseUrlFallback(string overrideValue = null)
    {
        if (!string.IsNullOrEmpty(overrideValue))
            return overrideValue;

        var cfg = Config;
        if (cfg != null && !string.IsNullOrEmpty(cfg.apiBaseUrlFallback))
            return cfg.apiBaseUrlFallback;

        return "http://localhost:8000";
    }
}
