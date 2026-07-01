insert into answer_tags (answer_option_id, tag_key, tag_value)
select distinct marker.answer_option_id, marker.tag_key, tag_definitions.tag_value
from answer_tags marker
join tag_definitions
  on tag_definitions.tag_key = marker.tag_key
where lower(marker.tag_value) in ('all', '<all>')
  and lower(tag_definitions.tag_value) not in ('all', '<all>')
on conflict (answer_option_id, tag_key, tag_value) do nothing;

insert into question_other_tags (question_id, tag_key, tag_value)
select distinct marker.question_id, marker.tag_key, tag_definitions.tag_value
from question_other_tags marker
join tag_definitions
  on tag_definitions.tag_key = marker.tag_key
where lower(marker.tag_value) in ('all', '<all>')
  and lower(tag_definitions.tag_value) not in ('all', '<all>')
on conflict (question_id, tag_key, tag_value) do nothing;

insert into question_value_tags (question_id, integer_min, integer_max, tag_key, tag_value)
select distinct
  marker.question_id,
  marker.integer_min,
  marker.integer_max,
  marker.tag_key,
  tag_definitions.tag_value
from question_value_tags marker
join tag_definitions
  on tag_definitions.tag_key = marker.tag_key
where lower(marker.tag_value) in ('all', '<all>')
  and lower(tag_definitions.tag_value) not in ('all', '<all>')
  and not exists (
    select 1
    from question_value_tags existing_target
    where existing_target.question_id = marker.question_id
      and existing_target.integer_min is not distinct from marker.integer_min
      and existing_target.integer_max is not distinct from marker.integer_max
      and existing_target.tag_key = marker.tag_key
      and existing_target.tag_value = tag_definitions.tag_value
  );
