/*
# Add school manager and accessibility info to studios

Plain-English summary: the "List your school" form now asks for the person responsible
for the school and a free-text accessibility/convenience note (for example
"Parking available, Near metro station"). The "Floor" and "First class discount" inputs
were removed from the form. This migration adds the two new columns.

## New columns
- stores.school_manager (text, nullable): name of the person responsible for the school
- stores.accessibility_info (text, nullable): free-text accessibility and convenience notes
- pre_registrations.school_manager (text, nullable): same, for "List your school" requests
- pre_registrations.accessibility_info (text, nullable): same, for "List your school" requests

## Notes
1. Additive only. The old floor and first_class_discount_pct columns are kept so no
   existing data is lost; the app simply no longer reads or writes them.
2. No change to row level security or grants. Existing policies cover the new columns.
3. Uses IF NOT EXISTS so it is safe to re-run.
*/

ALTER TABLE stores ADD COLUMN IF NOT EXISTS school_manager text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS accessibility_info text;

ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS school_manager text;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS accessibility_info text;
