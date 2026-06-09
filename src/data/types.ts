export type Confidence = "low" | "medium" | "high";
export type EdgeStatus = "accepted" | "tentative" | "disputed" | "deprecated";
export type ReviewState = "draft" | "needs_review" | "reviewed" | "blocked";

export type SourceEvidence = {
  source: string;
  claim: string;
  claim_scope?: string;
  locator?: string;
};

export type MalwareCategory =
  | "infostealer"
  | "ransomware"
  | "rat"
  | "loader"
  | "banker"
  | "botnet"
  | "backdoor"
  | "wiper"
  | "ics_sabotage"
  | "rootkit"
  | "other";

export type IdentityBasis =
  | "code_lineage"
  | "operator_continuity"
  | "brand_or_alias"
  | "public_name_bucket"
  | "campaign_or_incident";

export type RelationScope =
  | "code"
  | "operator"
  | "brand"
  | "infrastructure"
  | "distribution"
  | "behavior"
  | "campaign"
  | "targeting"
  | "ecosystem"
  | "design"
  | "reporting"
  | "unknown";

export type MalwareNode = {
  id: string;
  type: "malware_family";
  identity_basis: IdentityBasis;
  name: string;
  category?: MalwareCategory;
  aliases?: string[];
  summary: string;
  first_seen?: {
    value: string;
    precision: string;
    scope: string;
    sources: SourceEvidence[];
  };
  tags?: string[];
  sources: SourceEvidence[];
  status?: string;
  notes?: string;
};

export type AtlasEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
  direction: "directed" | "undirected";
  confidence: Confidence;
  evidence_type: string;
  relation_scope: RelationScope;
  status: EdgeStatus;
  sources: SourceEvidence[];
  curator_note?: string;
  confidence_reason?: string;
  review_state?: ReviewState;
  relation_qualifier?: string;
  shared_artifact_type?: string;
  created_at: string;
  updated_at: string;
};

export type AtlasSource = {
  id: string;
  title: string;
  publisher: string;
  authors?: string[];
  url: string;
  published_at?: string;
  retrieved_at: string;
  source_type: string;
  access_level: string;
  public_citability: "low" | "medium" | "high";
  license_posture:
    | "attribution_required"
    | "permissive_cc0_or_bsd_2_clause"
    | "standard_citation_notice"
    | "terms_limited_metadata_only"
    | "us_government_public_domain_low_friction"
    | "open_government_attribution_required"
    | "reuse_with_source_acknowledgement"
    | "mixed_academic_citation_only"
    | "copyrighted_citation_only";
  redistribution_policy:
    | "allowed_with_mitre_notice_no_endorsement"
    | "allowed_with_misp_license_notice"
    | "cite_standard_do_not_represent_standard_as_evidence"
    | "metadata_only_no_samples_no_bulk_mirror"
    | "infrastructure_metadata_only_no_bulk_mirror"
    | "cite_and_summarize_no_marks_no_endorsement"
    | "cite_and_summarize_with_attribution"
    | "cite_and_summarize_with_source_acknowledgement"
    | "metadata_and_short_curator_summary_only"
    | "cite_link_and_original_curator_summary_only";
  allowed_uses: string[];
  blocked_uses: string[];
  notice_required: boolean;
  trust_notes?: string;
};

export type Atlas = {
  nodes: MalwareNode[];
  edges: AtlasEdge[];
  sources: AtlasSource[];
  sourceById: Map<string, AtlasSource>;
  nodeById: Map<string, MalwareNode>;
};
