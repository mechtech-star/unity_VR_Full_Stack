using System;
using System.Collections.Generic;

/// <summary>
/// Data models for the module catalog (home page listing).
/// Deserialized from module_catalog.json.
/// </summary>

// ─── Catalog root (wraps the module list for JsonUtility) ────────────
[Serializable]
public class ModuleCatalogData
{
    public List<ModuleSummaryData> modules;
}

// ─── One entry per training module ───────────────────────────────────
[Serializable]
public class ModuleSummaryData
{
    public string moduleId;
    public string title;
    public string description;
    public string version;
    public string mode;                 // "VR" | "AR"
    public int    estimatedDurationMin;
    public string language;
    public int    taskCount;
    public int    stepCount;
    public string icon;                 // emoji or icon key
    public string jsonPath;             // Resources-relative path to the full training JSON
    public string thumbnail;            // Resources-relative path to thumbnail texture
    public List<string> tags;
}
