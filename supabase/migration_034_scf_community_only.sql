-- ============================================================
-- Migration 034: Remove SeeClickFix route where the city isn't on it
-- ============================================================
-- Completes migration 032's coverage check (all 559 SeeClickFix-routed
-- authorities scanned read-only on 2026-10-19: 510 have city request types,
-- 49 are community-map only). These 24 were scanned after 032 was written.
-- A SeeClickFix post at these points reaches no city staff, so the route is
-- removed; any email / web-form methods remain.
-- ============================================================
UPDATE public.authorities SET submission_methods = COALESCE((SELECT jsonb_agg(m) FROM jsonb_array_elements(submission_methods) m
  WHERE COALESCE(m->>'protocol','') <> 'seeclickfix' AND COALESCE(m->>'endpoint','') NOT LIKE '%seeclickfix.com/api%'), '[]'::jsonb),
  updated_at = NOW()
WHERE id IN ('67d5225b-e0ba-49c6-8a2f-08a620dfccfa','9cdfd220-6597-4c8a-b913-1fa15ca6f07b','22f255bc-a1e8-4751-8914-182d94b142de','bbca516e-ccb1-4017-a613-c74faa8d71bf','6f371a09-31ab-447a-b977-2eda692bc60d','dd104492-489e-424a-905c-21005a7111e2','88381f98-6755-4719-ba88-fbef5e9e6ecf','7816446d-e0ec-4b01-9b58-89e6736a7d5a','b7ec2c31-a3b6-4e5f-aa0a-caf16fd9d54f','4b6fd8f1-f401-4e76-95ea-3bc78b55e304','a52f586c-7c15-409a-8c0d-30dfc48f0dee','8d6472f6-a46a-4928-8981-8a8c67942e92','9b48a5f8-ac7a-44ed-a1e2-63e81cf8e126','13d5ced9-dc16-401c-a7cd-16db1b5fd597','c0c0a353-1e54-48fa-a4c9-587b72587344','7547d00f-2b87-4f7e-92f4-d0c424e694de','3f539943-eb7a-46ce-8523-55b17d1c626a','a8e38453-8932-46ad-bb71-e6574ebb12bc','89eb2f97-e8c6-405d-86a9-a98e1ed3ffae','98364c07-0f69-452c-8a8d-5f420a0fc0a9','99c9861d-c3c0-4669-a0d7-6a7b072be967','16b65521-3d26-4fed-ba54-c217c3d88afe','9e7e7b85-91dd-46cb-89d9-9ff238f64144','0ea9ba18-1c2c-4b6a-9e3c-c4a134c21c80');
