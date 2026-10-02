-- Use after real listeners rate transitions. Treat small samples as exploratory.
-- Card-level promise check: look for a consistently high jarring rate in cards
-- whose copy promises smooth continuity, and segment by confidence/source.
select playlist_type_id, source, count(*) as rated_transitions,
       count(*) filter (where rating = 'smooth') as smooth_count,
       count(*) filter (where rating = 'jarring') as jarring_count,
       round(100.0 * count(*) filter (where rating = 'jarring') / nullif(count(*) filter (where rating <> 'unsure'), 0), 1) as jarring_pct,
       round(avg((from_confidence + to_confidence) / 2), 2) as mean_feature_confidence
from public.transition_feedback
where created_at >= now() - interval '90 days'
group by playlist_type_id, source
having count(*) >= 10
order by jarring_pct desc nulls last;

-- Keyword-level checks can reveal which promises fail inside the same card.
select playlist_type_id, keyword, count(*) as rated_transitions,
       round(100.0 * count(*) filter (where rating = 'jarring') / nullif(count(*) filter (where rating <> 'unsure'), 0), 1) as jarring_pct
from public.transition_feedback, unnest(flow_keyword_ids) as keyword
group by playlist_type_id, keyword
having count(*) >= 10
order by jarring_pct desc nulls last;
