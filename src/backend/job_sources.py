"""Industry → role taxonomy for job preferences (GET /api/v1/preferences/catalog).

Job discovery is implemented via official integration APIs in
``src.backend.services.job_integrations`` — not HTML crawling.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Industry → Role taxonomy
# ---------------------------------------------------------------------------

INDUSTRY_ROLE_CATALOG: dict[str, list[str]] = {
    "IT Software": [
        "Engineering Manager",
        "Project Manager",
        "Technical Architect",
        "Full Stack Developer",
        "DevOps Engineer",
        "Data Engineer",
        "Software Architect",
        "QA Lead",
    ],
    "IT Services & Consulting": [
        "Solutions Architect",
        "Delivery Manager",
        "Practice Lead",
        "Pre-Sales Consultant",
        "Cloud Architect",
        "Integration Specialist",
    ],
    "Finance & Banking": [
        "Financial Analyst",
        "Risk Manager",
        "Portfolio Manager",
        "Compliance Officer",
        "Investment Banker",
        "Quantitative Analyst",
    ],
    "Healthcare": [
        "Clinical Data Manager",
        "Health Informatics Specialist",
        "Medical Director",
        "Regulatory Affairs Manager",
        "Biostatistician",
    ],
    "Manufacturing": [
        "Plant Manager",
        "Quality Engineer",
        "Supply Chain Manager",
        "Process Engineer",
        "Operations Director",
    ],
    "Education & Research": [
        "Research Scientist",
        "Academic Director",
        "Curriculum Developer",
        "EdTech Specialist",
        "Lab Manager",
    ],
    "Government & International Orgs": [
        "Programme Officer",
        "Policy Analyst",
        "Development Specialist",
        "Monitoring & Evaluation Officer",
        "Administrative Officer",
    ],
    "Marketing & Communications": [
        "Marketing Manager",
        "Content Strategist",
        "Digital Marketing Specialist",
        "Brand Manager",
        "PR Director",
    ],
}
