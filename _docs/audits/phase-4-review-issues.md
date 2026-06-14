
● Now I have all verifications. Let me compile the final ranked output.

  Verification summary:
  - EntityImagesEditor null images → CONFIRMED (data loss)
  - Flag channel switch → CONFIRMED (workflow broken)
  - Pending comment 1000-row truncation → CONFIRMED
  - stale targetIdFilter → PLAUSIBLE
  - VoteWidget score flash → PLAUSIBLE
  - TOCTOU pending cap race → REFUTED (DB advisory lock closes it)

  [
    {
      "file": "src/lib/api/admin.ts",
      "line": 2008,
      "summary": "getAdminEntitiesPage hardcodes image_url and hero_image_url as null in    
  AdminEntityListRow; EntityImagesEditor initializes its URL state from these null fields,  
  so the admin sees blank image previews and saving overwrites real images with null",      
      "failure_scenario": "An entity has an existing profile image. Admin opens the entities  list, clicks the images icon. setImagesEntity(entity) stores the list-row entity
  (image_url: null, hero_image_url: null). EntityImagesEditor mounts with
  useState(entity.image_url ?? '') → profileUrl = ''. Admin makes no change and clicks Save.  updateEntityImages writes image_url: null to the database, permanently deleting the       
  existing image."
    },
    {
      "file": "src/pages/claim/ClaimDetailPage.tsx",
      "line": 248,
      "summary": "Flag channel silently changed from suggestions table (type='flag_claim')  
  to content_flags — AdminSuggestionManagerPage still shows a 'Flag claim' filter type but  
  will receive zero new entries; all new claim flags land only in content_flags",
      "failure_scenario": "An admin monitors the suggestions queue filtered to 'Flag claim' 
  type to catch erroneous claim reports. After this change, users clicking 'Flag' on a claim  create rows in content_flags via submitFlag, not suggestions. The suggestions queue's     
  flag_claim filter returns nothing. The admin misses every new claim flag unless they      
  separately discover and check the new flags panel on AdminClaimManagerPage."
    },
    {
      "file": "src/lib/api/admin.ts",
      "line": 774,
      "summary": "getSignalSummariesForTargets fetches all pending comment rows without a   
  limit and counts them client-side; Supabase's default 1000-row cap silently truncates     
  results, causing pendingCommentCount to be under-reported",
      "failure_scenario": "An admin entity/claim page with 50 items where the queried       
  targets collectively have >1000 pending comments: PostgREST returns exactly 1000 rows, the  JS loop counts them, and some targets show 0 pending comments in the badge even though    
  they have unmoderated notes waiting. Admins navigating to those targets see no badge and  
  skip moderation."
    },
    {
      "file": "src/pages/admin/AdminCommentQueuePage.tsx",
      "line": 65,
      "summary": "targetIdFilter persists in URL when status or target-type dropdown changes  — silently narrows results to the old target with no prominent indicator",
      "failure_scenario": "Admin drills into pending comments for entity UUID 'abc…'. They  
  then switch the status dropdown to 'All statuses'. updateFilters passes no targetId,      
  leaving target_id=abc in the URL. The query still filters to that one entity, returning a 
  small subset while the page UI shows no visible filter chip or warning. Admin assumes they  are seeing all comments of all statuses."
    },
    {
      "file": "src/components/community/VoteWidget.tsx",
      "line": 95,
      "summary": "onSettled clears optimisticScore after awaiting invalidateQueries (which  
  returns before the background refetch completes), causing the vote score to snap back to  
  the pre-vote stale value for the duration of the network round-trip",
      "failure_scenario": "User votes +1. onMutate sets optimisticScore to +1. Mutation     
  succeeds. onSettled: invalidateQueries fires refetch (takes 100ms), then
  setOptimisticScore(null) executes immediately. For ~100ms the widget shows score.data     
  (pre-vote value) because the refetch hasn't landed. Score flashes: old → optimistic → old 
  → new. Visible on any non-localhost connection."
    },
    {
      "file": "src/lib/api/claims.ts",
      "line": 189,
      "summary": "getClaimGraph silently drops edges when a neighbor entity fails the       
  published status filter — the returned relationships array references entity IDs absent   
  from the entities array, then the final filter removes those edges with no indication of  
  the gap",
      "failure_scenario": "Claim connects entity A (direct, published) to entity B
  (neighbor, draft/unpublished). The A–B relationship survives into the relationships list  
  at line 158-163. B's ID appears in neighborIds. B is fetched with
  .eq('status','published') at line 172 but returns nothing. entitySet lacks B. The A–B     
  relationship is filtered out at line 191-193. The graph renders A as disconnected when it 
  is not. No truncatedRelationshipCount is exposed."
    },
    {
      "file": "src/pages/admin/AdminReviewQueuePage.tsx",
      "line": 27,
      "summary": "getNextPageParam returns allPages.length when lastPage.length ===
  reviewQueuePageSize — fires a spurious extra fetch when the queue size is an exact        
  multiple of the page size",
      "failure_scenario": "Review queue has exactly 50 pending sources (page size = 50).    
  Page 0 returns 50 items; getNextPageParam returns 1 (truthy). A 'Load more' button        
  appears. Admin clicks it; page 1 returns 0 items, getNextPageParam returns undefined,     
  button disappears. One unnecessary DB query and a brief misleading 'Load more' affordance 
  on what is actually the complete queue."
    },
    {
      "file": "src/components/community/FlagButton.tsx",
      "line": 26,
      "summary": "contributorRoles Set is defined independently in FlagButton.tsx and       
  CommentSection.tsx — a role added to one but not the other causes the flag gate and       
  comment gate to disagree on who can contribute",
      "failure_scenario": "Product adds a 'moderator' role to the contributor tier.
  Developer updates contributorRoles in CommentSection.tsx but misses FlagButton.tsx (or    
  vice versa). Moderators can now submit comments but see no Flag button (or have a Flag    
  button but no comment form). The split behavior appears only in production when the new   
  role is assigned to real users."
    },
    {
      "file": "src/pages/admin/AdminCommentQueuePage.tsx",
      "line": 126,
      "summary": "invalidateComments invalidates ['admin', 'claims'] and ['admin',
  'entities'] on every comment approve/reject/clarify — triggering full re-fetches of both  
  admin tables plus a second getSignalSummariesForTargets round-trip even though comment    
  moderation doesn't change entity or claim data",
      "failure_scenario": "Admin approves one comment. invalidateComments fires 4
  invalidateQueries calls. The claims and entities invalidations each cause a re-fetch of   
  the current 50-item paginated RPC plus a second getSignalSummariesForTargets call (3 DB   
  queries). A bulk approve of 20 comments fires this 20 times sequentially, making 80+      
  unnecessary DB queries that update only the signal summaries, not claim/entity content    
  itself."
    },
    {
      "file": "src/lib/api/admin.ts",
      "line": 1992,
      "summary": "getSignalSummariesForTargets is awaited serially after the main RPC in    
  both getAdminEntitiesPage and getAdminClaimsPage, adding a second network round-trip (3   
  parallel DB queries) to every admin entities and claims page load",
      "failure_scenario": "Every admin entities or claims page navigation costs 2 serial    
  round-trips: first get_admin_entities_page RPC (~60ms), then getSignalSummariesForTargets 
  (3 queries in parallel, ~60ms). Total page-data latency is ~120ms when it could be ~60ms  
  if the signal aggregation were folded into the existing RPC. The serial dependency was not  necessary — signal data could run in parallel with the main RPC."
    }
  ]