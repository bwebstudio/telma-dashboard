-- The follow-up log nobody could write in.
--
-- 0071 created `patient_notes` with the same door as `patients`, "word for
-- word" -- except that `patients` has a policy letting a clinic update its
-- own rows and this table never got one. Reading was allowed, writing was
-- internal only, and the comment said the writes would come through the
-- service role. They do not: every one of them is a server action on the
-- clinic's own session, because that is what makes `clinic_id` the clinic's
-- own and not a parameter somebody could pass.
--
-- So on the live panel: "Não foi possível completar a ação" on every note,
-- every contact attempt, and -- worse, because it was silent about why --
-- every opening and closing of a follow-up. Marking something as dealt with
-- set the column and then failed to write the entry that says so, which is
-- exactly the history the clinic opened the record for.
--
-- Nothing of this showed in the demo: it has no row level security to fail.
--
-- Entries belong to the person they are about, and the person belongs to a
-- clinic, so both are checked. A clinic writing its own id onto somebody
-- else's patient would otherwise be filing notes on a record it cannot see.
drop policy if exists patient_notes_clinic_insert on public.patient_notes;
create policy patient_notes_clinic_insert on public.patient_notes for insert
  with check (
    public.is_internal()
    or (
      clinic_id = public.current_clinic_id()
      and exists (
        select 1 from public.patients p
         where p.id = patient_id and p.clinic_id = public.current_clinic_id()
      )
    )
  );

-- Deleting one, which the record offers on every entry the clinic wrote.
drop policy if exists patient_notes_clinic_delete on public.patient_notes;
create policy patient_notes_clinic_delete on public.patient_notes for delete
  using (public.is_internal() or clinic_id = public.current_clinic_id());
