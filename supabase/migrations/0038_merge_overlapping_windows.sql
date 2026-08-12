-- The merge in 0035, done again, for the rows it could not see.
--
-- 0035 collapsed runs where one row ended exactly where the next began. That is
-- what a timetable looks like when appointments are booked back to back, and it
-- is not what most timetables look like: a clinic that sees people for thirty
-- minutes and starts a new one every fifteen produces rows that OVERLAP, and
-- 09:15-09:45 does not end where 09:30-10:00 begins.
--
-- So for those clinics nothing merged, and nothing said so. The hours screen
-- opened with forty rows for a Monday, one per bookable time, which is unusable
-- and is also exactly the thing 0035 was written to remove.
--
-- The fix is one comparison. A new window starts when the previous rows have
-- all finished before this one begins, and "the previous rows" needs a running
-- maximum rather than the row immediately before: with overlaps, the longest
-- reach so far is not the last one seen.
--
-- Lunch is still a gap and still splits the day, which is the property worth
-- keeping, and the times generated afterwards are unchanged because the step
-- was already read off the data in 0035.

-- The step, for the clinics that still have rows to measure it from.
--
-- Only pairs of rows that overlap or touch, which is the difference between
-- this and the same query in 0035. There, every row was still a single
-- appointment and the smallest gap was the step. Here some clinics have already
-- been merged, and the distance between their two remaining windows is lunch:
-- measuring it would set the step to six hours and clamp it to four, quietly
-- destroying a value that was correct. A clinic already merged contributes no
-- pairs at all and keeps what it has.
with steps as (
  select s.clinic_id,
         extract(epoch from (
           lead(s.start_time) over (partition by s.resource_id, s.weekday order by s.start_time)
           - s.start_time
         )) / 60 as gap,
         lead(s.start_time) over (partition by s.resource_id, s.weekday order by s.start_time)
           <= s.end_time as same_run
    from availability_slots s
),
per_clinic as (
  select clinic_id, min(gap)::smallint as step
    from steps
   where gap is not null and gap > 0 and same_run
   group by clinic_id
)
update clinics c
   set slot_minutes = greatest(least(per_clinic.step, 240), 5)
  from per_clinic
 where per_clinic.clinic_id = c.id;

with ordered as (
  select id, resource_id, weekday, start_time, end_time, capacity, active,
         max(end_time) over (
           partition by resource_id, weekday, capacity, active
           order by start_time
           rows between unbounded preceding and 1 preceding
         ) as reach
    from availability_slots
),
marked as (
  select *,
         -- Strictly before, so touching rows still merge exactly as they did.
         case when reach is null or reach < start_time then 1 else 0 end as opens
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
 where s.id = f.id
   and s.end_time <> f.closes_at;

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
