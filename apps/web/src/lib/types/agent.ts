export type AgentCategory =
  | "writing"
  | "research"
  | "finance"
  | "sales"
  | "hr"
  | "legal"
  | "service"
  | "product"
  | "tech"
  | "education"
  | "media"
  | "productivity";

export interface AgentConfig {
  id: string;
  label: string;
  description: string;
  expertise: string[];
  avatar: string;
  category: AgentCategory;
  promptFile: string;
  isDefault?: boolean;
}

export const CATEGORY_LABELS: Record<AgentCategory, string> = {
  writing: "Writing",
  research: "Research",
  finance: "Finance",
  sales: "Marketing",
  hr: "HR",
  legal: "Legal",
  service: "Service",
  product: "Product",
  tech: "Tech",
  education: "Education",
  media: "Media",
  productivity: "Productivity",
};
