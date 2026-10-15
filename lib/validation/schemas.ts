import type { ColType, ColumnSpec, Schema, StepId } from './types';

type Extra = Partial<Omit<ColumnSpec, 'key' | 'label' | 'level' | 'type'>>;

const req = (key: string, label: string, type: ColType = 'text', extra: Extra = {}): ColumnSpec => ({
  key,
  label,
  level: 'required',
  type,
  ...extra,
});
const rec = (key: string, label: string, type: ColType = 'text', extra: Extra = {}): ColumnSpec => ({
  key,
  label,
  level: 'recommended',
  type,
  ...extra,
});
const opt = (key: string, label: string, type: ColType = 'text', extra: Extra = {}): ColumnSpec => ({
  key,
  label,
  level: 'optional',
  type,
  ...extra,
});

export const SCHEMAS: Schema[] = [
  {
    id: 'usuarios',
    title: 'Usuarios',
    category: '01',
    sheetNames: ['Usuarios'],
    fileNameKeys: ['usuarios'],
    templateFile: 'Template_Usuarios_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre completo', 'lettersName', { aliases: ['nombre y apellido', 'apellido y nombre'] }),
      req('email', 'Email', 'email', { aliases: ['mail', 'correo', 'correo electronico', 'e-mail'], unique: true }),
      req('rol', 'Rol', 'enum', { enumValues: ['Administrador', 'Editor', 'Solo lectura'] }),
    ],
  },
  {
    id: 'sedes',
    title: 'Sedes',
    category: '01',
    sheetNames: ['Sedes'],
    fileNameKeys: ['sedes'],
    templateFile: 'Template_Sedes_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre de la sede', 'lettersName', { aliases: ['nombre sede', 'sucursal'], unique: true }),
      rec('codigo', 'Código', 'text', { aliases: ['codigo de sede', 'codigo sede', 'cod. sede'], unique: true }),
    ],
  },
  {
    id: 'sectores',
    title: 'Sectores',
    category: '01',
    sheetNames: ['Sectores'],
    fileNameKeys: ['sectores', 'centrosdecosto'],
    templateFile: 'Template_Sectores_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre del sector', 'name', {
        aliases: ['sector', 'nombre sector', 'centro de costo'],
        unique: true,
      }),
    ],
  },
  {
    id: 'practicas',
    title: 'Prácticas',
    category: '02',
    sheetNames: ['Prácticas', 'Practicas'],
    fileNameKeys: ['practicas'],
    templateFile: 'Template_Practicas_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de práctica', 'text', {
        aliases: ['codigo practica', 'cod. practica', 'cod practica', 'codigo'],
        unique: true,
      }),
      req('nombre', 'Nombre de práctica', 'name', { aliases: ['nombre practica', 'descripcion', 'practica'] }),
    ],
    dynamic: {
      placeholder: /^\[?\s*nombre del arancel\s*\d*\s*\]?$/,
      min: 0,
      label: 'arancel',
      firstRequired: true,
      missingMessage:
        'Agregá al menos una columna de arancel, con el nombre real del arancel como encabezado (por ejemplo "Derivación").',
      replaceHint: 'reemplazalo por el nombre real del arancel (por ejemplo "Derivación" o "Especial")',
    },
    providesCatalog: { catalog: 'practicas', column: 'codigo' },
  },
  {
    id: 'insumos',
    title: 'Insumos',
    category: '02',
    sheetNames: ['Insumos'],
    fileNameKeys: ['insumos'],
    templateFile: 'Template_Insumos_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de insumo', 'text', {
        aliases: ['codigo insumo', 'cod. insumo', 'cod insumo', 'codigo'],
        unique: true,
      }),
      req('nombre', 'Nombre de insumo', 'name', { aliases: ['nombre insumo', 'descripcion', 'insumo'] }),
      req('precio', 'Precio de última compra', 'number', {
        aliases: ['precio', 'precio ultima compra', 'ultimo precio'],
        min: 0,
      }),
      req('fecha', 'Fecha de última compra', 'date', { aliases: ['fecha', 'fecha ultima compra'] }),
      opt('proveedor', 'Proveedor', 'name'),
      opt('activo', 'Activo', 'boolean'),
      opt('cantidad', 'Cantidad', 'number', { aliases: ['stock'], min: 0 }),
    ],
    providesCatalog: { catalog: 'insumos', column: 'codigo' },
  },
  {
    id: 'relaciones_consumo',
    title: 'Relaciones de consumo',
    category: '02',
    sheetNames: ['Relaciones de consumo'],
    fileNameKeys: ['relacionesdeconsumo', 'relacionesconsumo'],
    templateFile: 'Template_Relaciones_Consumo_Optacost.xlsx',
    columns: [
      req('insumo', 'Código de insumo', 'text', { aliases: ['codigo insumo', 'cod. insumo'] }),
      req('practica', 'Código de práctica', 'text', { aliases: ['codigo practica', 'cod. practica'] }),
      req('rendimiento', 'Rendimiento', 'number', { greaterThan: 0 }),
    ],
    uniquePairs: [['insumo', 'practica']],
    catalogRefs: [
      { column: 'insumo', catalog: 'insumos' },
      { column: 'practica', catalog: 'practicas' },
    ],
  },
  {
    id: 'practicas_compuestas',
    title: 'Prácticas compuestas',
    category: '02',
    sheetNames: ['Practicas Compuestas', 'Prácticas compuestas'],
    fileNameKeys: ['practicascompuestas', 'practicasrelacionadas'],
    templateFile: 'Template_Practicas_Relacionadas_Optacost.xlsx',
    columns: [
      req('madre', 'Código práctica madre', 'text', { aliases: ['codigo de practica madre', 'practica madre', 'madre'] }),
      req('hija', 'Código práctica hija', 'text', { aliases: ['codigo de practica hija', 'practica hija', 'hija'] }),
    ],
    uniquePairs: [['madre', 'hija']],
    distinctPair: ['madre', 'hija'],
    catalogRefs: [
      { column: 'madre', catalog: 'practicas' },
      { column: 'hija', catalog: 'practicas' },
    ],
  },
  {
    id: 'facturacion',
    title: 'Facturación',
    category: '03',
    sheetNames: ['Facturación', 'Facturacion'],
    fileNameKeys: ['facturacion'],
    templateFile: 'Template_Facturacion_Optacost.xlsx',
    columns: [
      req('codigoPractica', 'Código de práctica', 'text', { aliases: ['codigo practica', 'cod. practica'] }),
      req('nombrePractica', 'Nombre de práctica', 'name', { aliases: ['nombre practica', 'practica'] }),
      req('codigoConvenio', 'Código de convenio', 'text', { aliases: ['codigo convenio', 'cod. convenio'] }),
      req('nombreConvenio', 'Nombre de convenio', 'name', { aliases: ['nombre convenio', 'convenio'] }),
      req('sede', 'Sede', 'name'),
      req('cantidad', 'Cantidad facturada', 'number', { aliases: ['cantidad'], min: 0 }),
      req('bruto', 'Bruto facturado', 'number', { aliases: ['bruto', 'monto facturado'] }),
      opt('ventanilla', 'Bruto en ventanilla', 'number', { aliases: ['ventanilla'] }),
      opt('derivacion', 'Identificador de derivación', 'text', { aliases: ['derivacion', 'derivada'] }),
    ],
    catalogRefs: [{ column: 'codigoPractica', catalog: 'practicas' }],
  },
  {
    id: 'costos_indirectos',
    title: 'Costos indirectos',
    category: '03',
    sheetNames: ['Costos Indirectos', 'Costos indirectos'],
    fileNameKeys: ['costosindirectos'],
    templateFile: 'Template_Costos_Indirectos_Optacost.xlsx',
    columns: [
      req('nombre', 'Nombre', 'name', { aliases: ['concepto', 'nombre del costo'] }),
      req('monto', 'Monto', 'number', { aliases: ['importe'], min: 0 }),
    ],
  },
  {
    id: 'convenios',
    title: 'Convenios de derivación',
    category: '04',
    sheetNames: ['Convenios de derivación', 'Convenios'],
    fileNameKeys: ['conveniosdederivacion', 'convenios'],
    templateFile: 'Template_Convenios_Optacost.xlsx',
    columns: [
      req('codigo', 'Código', 'text', { aliases: ['codigo de convenio', 'codigo convenio'], unique: true }),
      req('nombre', 'Nombre', 'name', { aliases: ['nombre de convenio', 'nombre convenio'] }),
      req('tipo', 'Tipo de arancel', 'enum', { enumValues: ['Derivación', 'Especial'] }),
      opt('ajuste', 'Ajuste', 'number'),
      opt('region', 'Región', 'name'),
    ],
  },
  {
    id: 'obras_sociales',
    title: 'Obras sociales',
    category: '04',
    sheetNames: ['Obras Sociales', 'Obras sociales'],
    fileNameKeys: ['obrassociales'],
    templateFile: 'Template_Obras_Sociales_Optacost.xlsx',
    columns: [
      req('codigo', 'Código', 'text', { aliases: ['codigo de obra social', 'codigo os'], unique: true }),
      req('nombre', 'Nombre', 'name', { aliases: ['nombre de obra social', 'obra social'] }),
      req('valorUb', 'Valor UB', 'number', { aliases: ['ub', 'valor de ub'], min: 0 }),
    ],
    providesCatalog: { catalog: 'obras_sociales', column: 'codigo' },
  },
  {
    id: 'modulos_obra_social',
    title: 'Módulos por obra social',
    category: '04',
    sheetNames: ['Módulos por Obra Social', 'Modulos por obra social'],
    fileNameKeys: ['modulosporobrasocial', 'modulosobrasocial', 'modulosobrassociales'],
    templateFile: 'Template_Modulos_Obra_Social_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de práctica', 'text', { aliases: ['codigo practica', 'cod. practica'], unique: true }),
      req('descripcion', 'Descripción de práctica', 'name', {
        aliases: ['descripcion', 'descripcion practica', 'nombre de practica'],
      }),
    ],
    dynamic: {
      placeholder: /^\[?\s*codigo de obra social\s*\d*\s*\]?$/,
      min: 0,
      label: 'obra social',
      firstRequired: true,
      missingMessage: 'Agregá al menos una columna por obra social, con su código como encabezado.',
      replaceHint: 'reemplazalo por el código real de la obra social',
    },
    catalogRefs: [{ column: 'codigo', catalog: 'practicas' }],
    dynamicCatalog: 'obras_sociales',
  },
  {
    id: 'precios_competencia',
    title: 'Lista de precios de competencia',
    category: '04',
    sheetNames: ['Lista de precios (competencia)', 'Lista de precios'],
    fileNameKeys: ['listaprecioscompetencia', 'preciosdecompetencia', 'precioscompetencia', 'listadeprecios'],
    templateFile: 'Template_Lista_Precios_Competencia_Optacost.xlsx',
    columns: [
      req('codigo', 'Código de examen', 'text', { aliases: ['codigo examen', 'codigo'], unique: true }),
      req('descripcion', 'Descripción', 'name', { aliases: ['descripcion de examen', 'descripcion examen'] }),
      req('precio', 'Precio', 'number', { min: 0 }),
    ],
    providesCatalog: { catalog: 'competencia', column: 'codigo' },
  },
  {
    id: 'matching_codigos',
    title: 'Matching de códigos',
    category: '04',
    sheetNames: ['Matching de códigos', 'Matching de codigos'],
    fileNameKeys: ['matchingdecodigos', 'matchingcodigos', 'matching'],
    templateFile: 'Template_Matching_Codigos_Optacost.xlsx',
    columns: [
      req('competencia', 'Código de examen de la competencia', 'text', {
        aliases: ['codigo competencia', 'codigo de la competencia'],
      }),
      req('propio', 'Código de examen propio', 'text', { aliases: ['codigo propio', 'codigo de practica'] }),
    ],
    uniquePairs: [['competencia', 'propio']],
    catalogRefs: [
      { column: 'competencia', catalog: 'competencia' },
      { column: 'propio', catalog: 'practicas' },
    ],
  },
];

const BY_ID = new Map(SCHEMAS.map((s) => [s.id, s]));

export function getSchema(id: StepId): Schema {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Esquema desconocido: ${id}`);
  return s;
}
