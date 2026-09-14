import type { RGAOp } from "./crdt/rga";

export interface Document {
  id: string;
  title: string;
  tiptap_content?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Operation {
  id: number;
  doc_id: string;
  op_type: string;
  payload: RGAOp | Record<string, unknown>;
  site_id: string;
  clock: number;
  created_at: string;
}
