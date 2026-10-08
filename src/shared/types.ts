export type AssetKind = 'portrait' | 'idFront' | 'idBack' | 'logo' | 'signature';
export interface Asset { id: string; kind: AssetKind; filename: string; mime: string; url: string; }
export interface Project { id: string; code: string; name: string; location: string; notes: string; archived: boolean; employeeCount: number; }
export interface ProjectInput { id?: string; code: string; name: string; location: string; notes: string; archived?: boolean; }
export interface Employee {
 id: string; fullName: string; birthDate: string; identityNumber: string; issueDate: string; permanentAddress: string;
 projectId: string; projectName: string; portraitId: string | null; idFrontId: string | null; idBackId: string | null;
 notes: string; archived: boolean; createdAt: string; updatedAt: string;
}
export interface EmployeeInput {
 id?: string; fullName: string; birthDate: string; identityNumber: string; issueDate: string; permanentAddress: string;
 projectId: string; portraitId: string | null; idFrontId: string | null; idBackId: string | null; notes: string; archived?: boolean;
}
export interface Assignment { id: string; employeeId: string; projectId: string; projectName: string; startDate: string; endDate: string | null; }
export interface CompanySettings {
 companyName: string; address: string; email: string; signingPlace: string; signingDepartment: string; signerName: string;
 logoId: string | null; signatureId: string | null;
}
export interface EmployeeFilter { projectId?: string; search?: string; includeArchived?: boolean; }
export interface OcrResult {
 fields: Partial<Pick<EmployeeInput,'fullName'|'birthDate'|'identityNumber'|'issueDate'|'permanentAddress'>>;
 text: string; warnings: string[];
}
export interface OcrProgress { status: string; progress: number; }
export interface ExportRequest { projectId: string; employeeIds: string[]; signingDate: string; }
export interface ExportPreview { token: string; pdfUrl: string; employeeCount: number; warnings: string[]; }
export interface AppInfo { version: string; dataDirectory: string; }
export interface TheAnAPI {
 projects: { list(includeArchived?: boolean): Promise<Project[]>; save(input: ProjectInput): Promise<Project>; archive(id: string): Promise<void>; };
 employees: { list(filter?: EmployeeFilter): Promise<Employee[]>; save(input: EmployeeInput): Promise<Employee>;
 archive(id: string, archived: boolean): Promise<void>; history(id: string): Promise<Assignment[]>;
 transfer(id: string, projectId: string, date: string): Promise<void>; };
 assets: { import(kind: AssetKind, data: Uint8Array, filename: string): Promise<Asset>; get(id: string): Promise<Asset | null>; };
 ocr: { recognize(assetIds: string[]): Promise<OcrResult>; onProgress(callback: (progress: OcrProgress) => void): () => void; };
 settings: { get(): Promise<CompanySettings>; save(settings: CompanySettings): Promise<CompanySettings>; };
 exports: { preview(request: ExportRequest): Promise<ExportPreview>; save(token: string, format: 'docx' | 'pdf' | 'both'): Promise<string[]>; };
 backup: { create(): Promise<string | null>; restore(): Promise<boolean>; };
 app: { info(): Promise<AppInfo>; openDataDirectory(): Promise<void>; };
}
declare global { interface Window { thean: TheAnAPI; } }

