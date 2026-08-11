-- The hours a clinic already has, rewritten as windows instead of as a list.
--
-- 0034 made a row mean "open from here to here" and generates the bookable
-- times from it. The rows that already exist do not mean that: the sign-up
-- exploded a timetable into one row per start, up to two thousand of them, so a
-- clinic open nine to seven has rows like 09:00-09:30, 09:30-10:00, and so on.
--
-- Read as windows, each of those still yields exactly the one time it yielded,
-- so nothing broke. But a thirty minute window has no room in it for anything
-- longer, and the whole point of 0034 was that a clinic can now say a laser
-- session takes forty-five. Those clinics would have found every long service
-- offering no times at all, on every day, with nothing in the panel to explain
-- it: the hours are there, ticked, and correct.
--
-- So the contiguous runs are merged back into the windows they came from.
--
-- `slot_minutes` is read back off the data rather than guessed: the gap between
-- consecutive starts is the step the clinic was actually running, and using it
-- means the merged window generates the same times as the exploded rows did.
-- That equality is the point of this migration, and it is what the test asserts.

-- What step each clinic was really running -----------------------------------
with steps as (
  select s.clinic_id,
         extract(epoch from (
           lead(s.start_time) over (partition by s.resource_id, s.weekday order by s.start_time)
           - s.start_time
         )) / 60 as gap
    from availability_slots s
),
per_clinic as (
  select clinic_id, min(gap)::smallint as step
    from steps
   where gap is not null and gap > 0
   group by clinic_id
)
update clinics c
   set slot_minutes = greatest(least(per_clinic.step, 240), 5)
  from per_clinic
 where per_clinic.clinic_id = c.id;

-- Contiguous runs, collapsed --------------------------------------------------
-- Gaps and islands: a row starts a new window when the previous row in the same
-- diary and weekday did not end exactly where this one begins. Lunch shows up
-- as a gap, so a clinic with a break keeps two windows that day, which is what
-- it means and what it should have been all along.
--
-- The first row of each run is stretched to cover it, rather than a new row
-- being inserted and the old ones dropped. Inserting cannot work: the window
-- begins where the first row begins, so it collides with that row on the unique
-- key, and `on conflict do nothing` silently leaves everything exactly as it
-- was. That is the version this migration had first, and it changed nothing at
-- all while reporting success.
with ordered as (
  select id, resource_id, weekday, start_time, end_time, capacity, active,
         lag(end_time) over (
           partition by resource_id, weekday, capacity, active
           order by start_time
         ) as prev_end
    from availability_slots
),
marked as (
  select *,
         case when prev_end is null or prev_end <> start_time then 1 else 0 end as opens
    from ordered
),
islands as (
  select *,
         sum(opens) over (
           partition by resource_id, weekday, capacity, active
           order by start_time
           rows between unbounded preceding and current row
         ) as island
    from marked
),
agg as (
  select resource_id, weekday, capacity, active, island,
         min(start_time) as opens_at,
         max(end_time)   as closes_at
    from islands
   group by resource_id, weekday, capacity, active, island
),
first_of_run as (
  select i.id, a.closes_at
    from islands i
    join agg a
      on a.resource_id = i.resource_id
     and a.weekday     = i.weekday
     and a.capacity    = i.capacity
     and a.active      = i.active
     and a.island      = i.island
   where i.start_time = a.opens_at
)
update availability_slots s
   set end_time = f.closes_at
  from first_of_run f
 where s.id = f.id;

-- Everything that is now inside one of those windows, and is not the window.
delete from availability_slots s
 where exists (
   select 1 from availability_slots w
    where w.resource_id = s.resource_id
      and w.weekday = s.weekday
      and w.capacity = s.capacity
      and w.active = s.active
      and w.id <> s.id
      and w.start_time <= s.start_time
      and w.end_time   >= s.end_time
 );
