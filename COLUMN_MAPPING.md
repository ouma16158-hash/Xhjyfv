# Onraiser Platform – DB Column Mapping

This document explains how existing dating-app columns are repurposed for the Onraiser job platform.
No new columns need to be added; existing schema is reused where possible.

## users table – Column Repurposing

| DB Column               | Original Purpose         | Onraiser Usage                                |
|-------------------------|--------------------------|--------------------------------------------|
| `orientation`           | Sexual orientation        | **User role**: `'seeker'` or `'employer'`  |
| `occupation`            | Job title                 | **Major Category / Industry**              |
| `employment_type`       | Employment type           | **Sub-Major (seeker) / Work Mode (employer)** |
| `education`             | Education level           | Education level (unchanged)                |
| `country_of_residence`  | Country of residence      | **Current Location / Office Location**     |
| `willing_to_relocate`   | Relocation willingness    | Same meaning (unchanged)                   |
| `smoking`               | Smoking habit             | **Night shift available (seeker)** / Shift type (employer) – `'Yes'`/`'No'` |
| `height`                | Height in cm              | **Minimum monthly salary (seeker)**        |
| `weight`                | Weight in kg              | **Maximum salary budget (employer)**       |
| `liveness_video_url`    | Liveness check video      | **JSON array of video introductions** (seeker) |
| `id_back_url`           | ID back photo             | **JSON array of document vault** (seeker)  |
| `profile_photo_url`     | Profile photo             | Profile photo / Company logo (unchanged)   |

## Preferences – Column Repurposing

| DB Column                    | Original Purpose              | Onraiser Usage                                                |
|------------------------------|-------------------------------|------------------------------------------------------------|
| `pref_country_of_birth`      | Preferred country of birth    | **Seeker**: preferred work modes (CSV: `"Remote,Hybrid"`)<br>**Employer**: required major category |
| `pref_country_of_residence`  | Preferred country             | **Seeker**: preferred sub industry<br>**Employer**: required sub-major |
| `pref_country`               | Preferred country             | **Seeker**: preferred company sizes (CSV: `"Startup,Corporate"`) |
| `pref_languages`             | Preferred languages           | **Seeker**: main industry specialisation (PG array: `{Engineering & Tech}`) |
| `pref_religion`              | Preferred religion            | **Recency filter**: `'today'` or `'any'` (both roles)     |
| `pref_body_type`             | Preferred body type           | **Employer**: minimum required education level             |
| `pref_smoking`               | Smoking preference            | **Employer**: night shift required (`'Yes'`/`'No'`)        |
| `pref_willing_to_relocate`   | Relocation preference         | **Employer**: candidate must be willing to relocate        |
| `pref_gender`                | Gender preference             | **Employer**: preferred candidate gender                   |
| `pref_age_min`               | Minimum age                   | **Employer**: minimum candidate age                        |

## Available Columns for Future Repurposing (currently unused)

| DB Column              | Original Dating Purpose       | Available for                                    |
|------------------------|-------------------------------|--------------------------------------------------|
| `religion`             | User's religion               | **Small bio / company bio**                      |
| `religious_importance` | How important religion is     | **Seeker experience**                            |
| `political_views`      | Political views               | **Seeker projects**                              |
| `skin_color`           | Physical appearance           | **Seeker skills**                                |
| `body_type`            | Physical build                | **Seeker address**                               |
| `eye_color`            | Eye colour                    | Any text/category field                          |
| `hair_color`           | Hair colour                   | Any text/category field                          |
| `ethnicity`            | Ethnic background             | Any text/category field                          |
| `diet`                 | Diet preference               | Any text/category field                          |
| `drinking`             | Alcohol habit                 | Any text/category field                          |
| `exercise`             | Fitness habit                 | Any text/category field                          |
| `pets`                 | Pet ownership                 | Any boolean/text field                           |
| `living_situation`     | Living arrangement            | Any text/category field                          |
| `children`             | Children status               | **Seeker referees**                              |
| `found_match`          | Found a partner               | Any boolean flag                                 |
| `matched_with`         | Partner ID                    | Any reference/ID field                           |
| `pref_height`          | Preferred height              | **Seeker preferred monthly salary**              |
| `pref_weight`          | Preferred weight              | Any numeric range field                          |
| `pref_skin_color`      | Preferred skin colour         | Any text/category field                          |
| `pref_ethnicity`       | Preferred ethnicity           | Any text/category field                          |
| `pref_diet`            | Preferred diet                | Any text/category field                          |
| `pref_drinking`        | Preferred drinking habit      | Any text/category field                          |
| `pref_exercise`        | Preferred fitness             | Any text/category field                          |
| `pref_pets`            | Pet preference                | Any boolean/text field                           |
| `pref_children`        | Children preference           | Any text/category field                          |
| `pref_living_situation`| Living pref                   | **Seeker: preferred work location** (free text)  |
| `pref_relationship_type`| Relationship type            | Any text/category field                          |

> **Rule:** Never add a new column to the `users` table. Always pick an unused column from the list above and document its new purpose here.

## user_interactions table – Action Values

| Action          | Who performs it | Meaning                              |
|-----------------|-----------------|--------------------------------------|
| `applied`       | Seeker          | Seeker applies to employer posting   |
| `shortlisted`   | Employer        | Employer shortlists a seeker         |
| `chat_enabled`  | Employer        | Employer activates chat with seeker  |
| `removed`       | Either          | Removes an interaction               |
| `selected`      | Either (legacy) | Treated as `applied` for seekers     |
| `accepted`      | Either (legacy) | Treated as `chat_enabled` for employers |

## Match Score Algorithm (8 attributes, each worth 1 point)

The seeker dashboard now uses 4 match checks and shows the number matched out of 4:

1. **Main industry**: seeker preferred main industry vs company profile or active job post text
2. **Sub industry**: seeker preferred sub industry vs company profile or active job post text
3. **Salary**: seeker preferred salary vs company budget or active job post salary
4. **Location**: seeker preferred location vs company location
