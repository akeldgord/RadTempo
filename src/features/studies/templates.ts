/**
 * Application-level study type templates, seeded into `user_study_types` at
 * onboarding (see `src/features/onboarding/service.ts`). Purely data; edit
 * this list to change what new users are offered. See docs/SPEC.md, section
 * "Study types".
 */

export type Modality = "CT" | "MRI";

export interface StudyTypeTemplate {
  /** Stable id, stored on the copied row as `created_from_template`. Never
   * reused for a different study once published, so re-seeding stays
   * idempotent and imports can match by it. */
  id: string;
  modality: Modality;
  bodyRegion: string;
  name: string;
  shortName: string;
}

/**
 * Display order for modality -> body region in the Studies / Browse
 * hierarchy. Regions not listed fall back to alphabetical order after the
 * listed ones.
 */
export const REGION_ORDER: Record<Modality, string[]> = {
  CT: ["Chest", "Abdomen/Pelvis", "Combined"],
  MRI: ["Abdomen", "Pelvis", "Combined"],
};

export const MODALITY_ORDER: Modality[] = ["CT", "MRI"];

export const STUDY_TYPE_TEMPLATES: StudyTypeTemplate[] = [
  // --- CT / Chest ---------------------------------------------------------
  {
    id: "ct-chest-without-contrast",
    modality: "CT",
    bodyRegion: "Chest",
    name: "CT Chest without contrast",
    shortName: "CT Chest −C",
  },
  {
    id: "ct-chest-with-contrast",
    modality: "CT",
    bodyRegion: "Chest",
    name: "CT Chest with contrast",
    shortName: "CT Chest +C",
  },
  {
    id: "cta-chest",
    modality: "CT",
    bodyRegion: "Chest",
    name: "CTA Chest",
    shortName: "CTA Chest",
  },

  // --- CT / Abdomen/Pelvis -------------------------------------------------
  {
    id: "ct-ap-without-contrast",
    modality: "CT",
    bodyRegion: "Abdomen/Pelvis",
    name: "CT Abdomen/Pelvis without contrast",
    shortName: "CT A/P −C",
  },
  {
    id: "ct-ap-with-contrast",
    modality: "CT",
    bodyRegion: "Abdomen/Pelvis",
    name: "CT Abdomen/Pelvis with contrast",
    shortName: "CT A/P +C",
  },
  {
    id: "ct-ap-with-and-without-contrast",
    modality: "CT",
    bodyRegion: "Abdomen/Pelvis",
    name: "CT Abdomen/Pelvis with & without contrast",
    shortName: "CT A/P ±C",
  },
  {
    id: "cta-abdomen-pelvis",
    modality: "CT",
    bodyRegion: "Abdomen/Pelvis",
    name: "CTA Abdomen/Pelvis",
    shortName: "CTA A/P",
  },

  // --- CT / Combined --------------------------------------------------------
  {
    id: "ct-cap-without-contrast",
    modality: "CT",
    bodyRegion: "Combined",
    name: "CT Chest + Abdomen/Pelvis without contrast",
    shortName: "CT C/A/P −C",
  },
  {
    id: "ct-cap-with-contrast",
    modality: "CT",
    bodyRegion: "Combined",
    name: "CT Chest + Abdomen/Pelvis with contrast",
    shortName: "CT C/A/P +C",
  },
  {
    id: "ct-cap-with-and-without-contrast",
    modality: "CT",
    bodyRegion: "Combined",
    name: "CT Chest + Abdomen/Pelvis with & without contrast",
    shortName: "CT C/A/P ±C",
  },

  // --- MRI / Abdomen --------------------------------------------------------
  {
    id: "mri-abdomen-without-contrast",
    modality: "MRI",
    bodyRegion: "Abdomen",
    name: "MRI Abdomen without contrast",
    shortName: "MRI Abdomen −C",
  },
  {
    id: "mri-abdomen-with-and-without-contrast",
    modality: "MRI",
    bodyRegion: "Abdomen",
    name: "MRI Abdomen with & without contrast",
    shortName: "MRI Abdomen W/WO",
  },
  {
    id: "mrcp",
    modality: "MRI",
    bodyRegion: "Abdomen",
    name: "MRCP",
    shortName: "MRCP",
  },

  // --- MRI / Pelvis ---------------------------------------------------------
  {
    id: "mri-pelvis-without-contrast",
    modality: "MRI",
    bodyRegion: "Pelvis",
    name: "MRI Pelvis without contrast",
    shortName: "MRI Pelvis −C",
  },
  {
    id: "mri-pelvis-with-and-without-contrast",
    modality: "MRI",
    bodyRegion: "Pelvis",
    name: "MRI Pelvis with & without contrast",
    shortName: "MRI Pelvis W/WO",
  },
  {
    id: "mri-prostate",
    modality: "MRI",
    bodyRegion: "Pelvis",
    name: "MRI Prostate",
    shortName: "MRI Prostate",
  },

  // --- MRI / Combined --------------------------------------------------------
  {
    id: "mri-abdomen-pelvis-without-contrast",
    modality: "MRI",
    bodyRegion: "Combined",
    name: "MRI Abdomen + Pelvis without contrast",
    shortName: "MRI A/P −C",
  },
  {
    id: "mri-abdomen-pelvis-with-and-without-contrast",
    modality: "MRI",
    bodyRegion: "Combined",
    name: "MRI Abdomen + Pelvis with & without contrast",
    shortName: "MRI A/P W/WO",
  },
];

export function getTemplateById(id: string): StudyTypeTemplate | undefined {
  return STUDY_TYPE_TEMPLATES.find((t) => t.id === id);
}
