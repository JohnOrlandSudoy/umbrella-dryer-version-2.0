/**
 * Major Fusion / FBX top-level assemblies (matches outliner naming; `:1` etc. resolved via flexible find).
 */
export const MODEL_ASSEMBLY_PARTS = [
  { id: 'cabinet_body', label: 'Cabinet Body', search: 'Cabinet_Body' },
  { id: 'base_heater_blower', label: 'Base Heater / Blower', search: 'Base_Heater_Blower' },
  { id: 'central_mcu_unit', label: 'Central MCU Unit', search: 'Central_MCU_Unit' },
  { id: 'safety_systems', label: 'Safety Systems', search: 'Safety_Systems' },
  { id: 'queue_control_board', label: 'Queue Control Board', search: 'Queue_Control_Board' },
  {
    id: 'internal_heating_system',
    label: 'Internal Heating System',
    search: 'Internal_Heating_System',
  },
  { id: 'control_panel_asm', label: 'Control Panel', search: 'Control_Panel' },
  { id: 'rotating_rack', label: 'Rotating Rack', search: 'Rotating_Rack' },
  { id: 'electrical_system', label: 'Electrical System', search: 'Electrical_System' },
  {
    id: 'umbrella_rack_assembly',
    label: 'Umbrella Rack Assembly',
    search: 'Umbrella_Rack_Assembly',
  },
  { id: 'umbrellas', label: 'Umbrellas', search: 'Umbrellas' },
] as const

export type ModelAssemblyPartId = (typeof MODEL_ASSEMBLY_PARTS)[number]['id']

export function defaultAssemblyVisibility(): Record<ModelAssemblyPartId, boolean> {
  return Object.fromEntries(MODEL_ASSEMBLY_PARTS.map((p) => [p.id, true])) as Record<
    ModelAssemblyPartId,
    boolean
  >
}
