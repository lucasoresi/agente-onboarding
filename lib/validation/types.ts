export type Cell = string | number | boolean | Date | null;

/** Fila no vacía con su número real de fila (1-based, como en Excel). */
export type Row = { line: number; cells: Cell[] };

export type Sheet = { name: string; lines: Row[] };

export type ParsedFile = { fileName: string; sheets: Sheet[] };

export const STEP_IDS = [
  'usuarios',
  'sedes',
  'sectores',
  'practicas',
  'insumos',
  'relaciones_consumo',
  'practicas_compuestas',
  'facturacion',
  'costos_indirectos',
  'convenios',
  'obras_sociales',
  'modulos_obra_social',
  'precios_competencia',
  'matching_codigos',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type Category = '01' | '02' | '03' | '04';
export type Level = 'required' | 'recommended' | 'optional';
/** 'name': texto con al menos una letra (un nombre no puede ser solo un número). 'personName': nombre de persona, solo letras, espacios, guiones, apóstrofos y puntos. */
export type ColType = 'text' | 'name' | 'personName' | 'number' | 'date' | 'email' | 'enum' | 'boolean';

export type ColumnSpec = {
  key: string;
  label: string;
  aliases?: string[];
  level: Level;
  type: ColType;
  enumValues?: string[];
  /** Mínimo inclusive (por ejemplo 0 para "no negativo"). */
  min?: number;
  /** Debe ser estrictamente mayor que este valor. */
  greaterThan?: number;
  unique?: boolean;
};

export type DynamicSpec = {
  /** Se compara contra el encabezado normalizado para detectar marcadores sin reemplazar. */
  placeholder: RegExp;
  min: number;
  /** Qué representa cada columna dinámica, para los mensajes (por ejemplo "arancel"). */
  label: string;
  /** La primera columna dinámica es obligatoria en cada fila. */
  firstRequired: boolean;
  missingMessage: string;
  replaceHint: string;
};

export type CatalogName = 'practicas' | 'insumos';

export type Schema = {
  id: StepId;
  title: string;
  category: Category;
  sheetNames: string[];
  /** Claves normalizadas (sin tildes, espacios ni símbolos) para reconocer el nombre del archivo. */
  fileNameKeys: string[];
  templateFile: string;
  columns: ColumnSpec[];
  dynamic?: DynamicSpec;
  uniquePairs?: [string, string][];
  distinctPair?: [string, string];
  catalogRefs?: { column: string; catalog: CatalogName }[];
  providesCatalog?: { catalog: CatalogName; column: string };
};

export type RuleId =
  | 'archivo_vacio'
  | 'columna_faltante'
  | 'columna_recomendada_faltante'
  | 'columna_desconocida'
  | 'celda_vacia'
  | 'tipo_invalido'
  | 'fuera_de_rango'
  | 'valor_no_permitido'
  | 'duplicado'
  | 'placeholder_sin_reemplazar'
  | 'sin_columnas_dinamicas'
  | 'fila_de_ejemplo'
  | 'nombre_archivo'
  | 'codigo_no_en_catalogo'
  | 'catalogo_no_verificado';

export type Issue = {
  rule: RuleId;
  message: string;
  row?: number;
  column?: string;
  value?: string;
  suggestion?: string;
};

export type ValidationReport = {
  fileName: string;
  schemaId: StepId;
  schemaTitle: string;
  sheetName: string;
  ok: boolean;
  rows: number;
  errorCount: number;
  warningCount: number;
  /** Como máximo MAX_ISSUES; el total real está en errorCount. */
  errors: Issue[];
  warnings: Issue[];
  dynamicColumns?: string[];
};
