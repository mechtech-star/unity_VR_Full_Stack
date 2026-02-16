using UnityEditor;
using UnityEngine;

[InitializeOnLoad]
static class AppConfigAssetCreator
{
    const string assetPath = "Assets/Resources/app_config.asset";

    static AppConfigAssetCreator()
    {
        EditorApplication.delayCall += CreateIfMissing;
    }

    static void CreateIfMissing()
    {
        var existing = Resources.Load<AppConfig>("app_config");
        if (existing != null)
            return;

        // Ensure Resources folder exists
        if (!AssetDatabase.IsValidFolder("Assets/Resources"))
            AssetDatabase.CreateFolder("Assets", "Resources");

        var cfg = ScriptableObject.CreateInstance<AppConfig>();
        cfg.apiBaseUrl = "http://localhost:8000";
        cfg.apiBaseUrlFallback = "http://192.168.29.239:8000";

        AssetDatabase.CreateAsset(cfg, assetPath);
        AssetDatabase.SaveAssets();
        Debug.Log("[AppConfig] Created default app_config at Assets/Resources/app_config.asset");
    }
}
