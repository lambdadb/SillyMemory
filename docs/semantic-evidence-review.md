# Semantic evidence fixture review

**Status: proposed; human semantic review pending.**

These are fresh short synthetic annotation cases, not live or long-context results.
Confirm minimum answer spans, mandatory context, speaker/quotation attribution and forbidden claims.
The source-only candidate input excludes this rubric. No candidate has been evaluated here.

Fixture SHA-256: `87079526a3f8f57b82df58ec505d5d1919b39d832bd17dd967b35ae6dae4d5b6` (parsed JSON serialization).

Reviewer: _unfilled_

Review date: _unfilled_

## en-minimal-fact

**Question:** Who brings the copper compass, and when?

**Source:**

- Message 0 · user · User: The dock office needs a fresh coat of paint. Nadia will bring the copper compass on Thursday morning. The windows were washed yesterday.
- Message 1 · assistant · Lina: I will keep space on the workbench.

**Expected answer rule:** Nadia brings the copper compass on Thursday morning.

**Required spans:**

- delivery (answer), message 0, UTF-16 [45, 101): Nadia will bring the copper compass on Thursday morning.
  Reason: Contains actor, object and time; the paint/windows are unrelated.

**Forbidden claims:**

- Assigning delivery to Lina or User.
- Changing Thursday morning.

**Rationale:** The complete answer-bearing sentence is enough; surrounding decoration is not required.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-minimal-fact

**Question:** 옥색 망원경은 누가 언제 가져오나요?

**Source:**

- Message 0 · user · User: 정원 사무실의 벽지는 새로 붙였어요. 다은이 옥색 망원경을 화요일 오후에 가져와요. 화분은 어제 물을 줬어요.
- Message 1 · assistant · 수빈: 작업대에 자리를 비워 둘게요.

**Expected answer rule:** 다은이 옥색 망원경을 화요일 오후에 가져온다.

**Required spans:**

- delivery (answer), message 0, UTF-16 [21, 46): 다은이 옥색 망원경을 화요일 오후에 가져와요.
  Reason: The actor/object/time sentence is sufficient; wallpaper and plants are unrelated.

**Forbidden claims:**

- 수빈이나 사용자에게 가져올 책임을 돌린다.
- 화요일 오후를 바꾼다.

**Rationale:** One sentence carries the full answer without unrelated surrounding details.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## en-correction

**Question:** What is the final ferry briefing time, and is the old slot still available?

**Source:**

- Message 0 · assistant · Lina: The draft ferry briefing is at 09:20.
- Message 1 · user · User: The final ferry briefing starts at 10:45. The earlier 09:20 slot is canceled and is not an alternative. The noticeboard has a new wooden frame.

**Expected answer rule:** 10:45 is final; 09:20 is canceled, not a second option.

**Required spans:**

- final-time (answer), message 1, UTF-16 [0, 41): The final ferry briefing starts at 10:45.
  Reason: Names the current final time.
- cancel-old (correction), message 1, UTF-16 [42, 103): The earlier 09:20 slot is canceled and is not an alternative.
  Reason: The question explicitly asks whether the old slot remains available.

**Forbidden claims:**

- Offering 09:20 as a valid alternative.
- Presenting both times as current.

**Rationale:** Keeping the number alone is insufficient: the cancellation resolves the conflicting older turn.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-correction

**Question:** 정원 안내 모임의 최종 시각은 언제이며 예전 시간도 가능한가요?

**Source:**

- Message 0 · assistant · 수빈: 초안에는 정원 안내 모임이 오전 11시 10분이라고 적혀 있어요.
- Message 1 · user · User: 정원 안내 모임은 최종적으로 오후 1시 40분에 시작해요. 예전 오전 11시 10분 일정은 취소됐으며 선택할 수 없어요. 게시판 테두리는 새 나무로 바꿨어요.

**Expected answer rule:** 오후 1시 40분이 최종이며 오전 11시 10분은 취소되어 불가능하다.

**Required spans:**

- final-time (answer), message 1, UTF-16 [0, 32): 정원 안내 모임은 최종적으로 오후 1시 40분에 시작해요.
  Reason: Current final time.
- cancel-old (correction), message 1, UTF-16 [33, 67): 예전 오전 11시 10분 일정은 취소됐으며 선택할 수 없어요.
  Reason: Explicitly disallows the superseded option.

**Forbidden claims:**

- 오전 11시 10분도 가능하다고 한다.
- 두 시각을 모두 현재 일정으로 제시한다.

**Rationale:** Both the new time and cancellation are required, not the noticeboard detail.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## en-negation

**Question:** Who collects the amber crate, when, and is the leaflet statement correct?

**Source:**

- Message 0 · assistant · Lina: The leaflet says, "Owen will collect the amber crate."
- Message 1 · user · User: That leaflet statement is false. Priya will collect the amber crate on Monday. The crate has a narrow leather strap.

**Expected answer rule:** Priya collects the amber crate on Monday; the leaflet claim about Owen is false.

**Required spans:**

- collector (answer), message 1, UTF-16 [33, 78): Priya will collect the amber crate on Monday.
  Reason: Current collector, not the quoted obsolete actor.
- deny-leaflet (negation), message 1, UTF-16 [0, 32): That leaflet statement is false.
  Reason: Explicit denial must survive extraction.
- leaflet-reference (reference), message 0, UTF-16 [0, 54): The leaflet says, "Owen will collect the amber crate."
  Reason: Identifies what the anaphoric denial refers to.

**Forbidden claims:**

- Assigning the crate to Owen.
- Treating the leaflet as current truth.

**Rationale:** A denial and its cross-turn antecedent are necessary to reject the quoted distractor.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-negation

**Question:** 호박색 상자는 누가 언제 수거하며 안내지 내용은 맞나요?

**Source:**

- Message 0 · assistant · 수빈: 안내지에는 "태오가 호박색 상자를 수거한다"라고 적혀 있어요.
- Message 1 · user · User: 그 안내지 내용은 사실이 아니에요. 유리가 월요일에 호박색 상자를 수거해요. 상자에는 가는 가죽 끈이 달려 있어요.

**Expected answer rule:** 유리가 월요일에 수거하며 태오가 수거한다는 안내지 내용은 틀리다.

**Required spans:**

- collector (answer), message 1, UTF-16 [20, 42): 유리가 월요일에 호박색 상자를 수거해요.
  Reason: Actual collector.
- deny-leaflet (negation), message 1, UTF-16 [0, 19): 그 안내지 내용은 사실이 아니에요.
  Reason: Negation changes whether the quotation is true.
- leaflet-reference (reference), message 0, UTF-16 [0, 34): 안내지에는 "태오가 호박색 상자를 수거한다"라고 적혀 있어요.
  Reason: Identifies the denied statement.

**Forbidden claims:**

- 태오에게 수거를 맡긴다.
- 안내지를 현재 사실로 인정한다.

**Rationale:** Extracting a quote without the following denial changes the answer.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## en-condition

**Question:** Can we use the east ramp, and what should we do if it is not opened?

**Source:**

- Message 0 · user · User: We can use the east ramp. Only if the harbor marshal opens its barrier; otherwise wait at the west shed. The shed roof was repainted last month.
- Message 1 · assistant · Lina: I have noted the access instructions.

**Expected answer rule:** Use the east ramp only when the marshal opens its barrier; otherwise wait at the west shed.

**Required spans:**

- ramp (answer), message 0, UTF-16 [0, 25): We can use the east ramp.
  Reason: Proposed route.
- condition (qualification), message 0, UTF-16 [26, 104): Only if the harbor marshal opens its barrier; otherwise wait at the west shed.
  Reason: Necessary condition and fallback; the first sentence alone overstates permission.

**Forbidden claims:**

- Unconditional access to the ramp.
- Waiting at the east ramp instead of the west shed.

**Rationale:** Exact copying of the first sentence is still misleading if the next sentence is omitted.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-condition

**Question:** 남쪽 통로를 써도 되나요? 열리지 않으면 어디에서 기다려야 하나요?

**Source:**

- Message 0 · user · User: 남쪽 통로를 이용해도 돼요. 단, 정원 관리인이 차단문을 열었을 때만 가능하며 아니면 북쪽 온실에서 기다려요. 온실 지붕은 지난달에 칠했어요.
- Message 1 · assistant · 수빈: 출입 조건을 적어 둘게요.

**Expected answer rule:** 관리인이 차단문을 열었을 때만 남쪽 통로를 쓰고 아니면 북쪽 온실에서 기다린다.

**Required spans:**

- ramp (answer), message 0, UTF-16 [0, 15): 남쪽 통로를 이용해도 돼요.
  Reason: Proposed route.
- condition (qualification), message 0, UTF-16 [16, 61): 단, 정원 관리인이 차단문을 열었을 때만 가능하며 아니면 북쪽 온실에서 기다려요.
  Reason: Mandatory condition and fallback.

**Forbidden claims:**

- 조건 없이 남쪽 통로를 이용한다.
- 북쪽 온실 이외의 대기 장소를 만든다.

**Rationale:** The permission and qualifier must travel together.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## en-speaker

**Question:** Which item am I collecting and when, and which item are you collecting and when?

**Source:**

- Message 0 · user · User: I will collect the indigo parcel on Friday. My bicycle has a new basket.
- Message 1 · assistant · Lina: I will collect the silver case on Sunday. I put a blank checklist on the desk.

**Expected answer rule:** The user collects the indigo parcel on Friday; Lina collects the silver case on Sunday.

**Required spans:**

- user-task (answer), message 0, UTF-16 [0, 43): I will collect the indigo parcel on Friday.
  Reason: First person belongs to the user role.
- assistant-task (answer), message 1, UTF-16 [0, 41): I will collect the silver case on Sunday.
  Reason: First person belongs to Lina, not the user.

**Forbidden claims:**

- Swapping User and Lina.
- Assigning both items to the same person.

**Rationale:** Both utterances say I; exact native role/speaker provenance is part of coverage.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-speaker

**Question:** 제가 언제 무엇을 받기로 했고, 당신은 언제 무엇을 받기로 했죠?

**Source:**

- Message 0 · user · User: 저는 금요일에 청록색 보따리를 받을게요. 자전거 바구니를 새로 달았어요.
- Message 1 · assistant · 수빈: 저는 일요일에 흰색 서류함을 받을게요. 책상에는 빈 점검표를 뒀어요.

**Expected answer rule:** 사용자는 금요일에 청록색 보따리를, 수빈은 일요일에 흰색 서류함을 받는다.

**Required spans:**

- user-task (answer), message 0, UTF-16 [0, 22): 저는 금요일에 청록색 보따리를 받을게요.
  Reason: User first person.
- assistant-task (answer), message 1, UTF-16 [0, 21): 저는 일요일에 흰색 서류함을 받을게요.
  Reason: Assistant first person.

**Forbidden claims:**

- 사용자와 수빈의 역할을 뒤바꾼다.
- 두 물건을 같은 사람이 받는다고 한다.

**Rationale:** Role metadata disambiguates the two first-person statements.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## en-reference

**Question:** Which locker is reserved for Keiko, and until when?

**Source:**

- Message 0 · user · User: The numbered locker beside the mural is called Harbor Six. The mural shows a sailboat.
- Message 1 · assistant · Lina: It is reserved for Keiko until noon. The corridor lights turn on automatically.

**Expected answer rule:** Harbor Six, the numbered locker beside the mural, is reserved for Keiko until noon.

**Required spans:**

- reservation (answer), message 1, UTF-16 [0, 36): It is reserved for Keiko until noon.
  Reason: Reservation has a pronoun subject.
- antecedent (reference), message 0, UTF-16 [0, 58): The numbered locker beside the mural is called Harbor Six.
  Reason: Resolves It to the named locker, not a guessed item.

**Forbidden claims:**

- Inventing a different locker name.
- Treating It as the mural.

**Rationale:** The answer sentence alone lacks the identity asked for by the question.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-reference

**Question:** 예린에게 어느 보관함을 언제까지 배정했나요?

**Source:**

- Message 0 · user · User: 분수 옆의 번호 달린 보관함은 정원 일곱이라고 불러요. 분수 조명은 초록색이에요.
- Message 1 · assistant · 수빈: 그것은 예린에게 오후 4시까지 배정돼 있어요. 복도 불은 자동으로 켜져요.

**Expected answer rule:** 분수 옆 정원 일곱 보관함을 예린에게 오후 4시까지 배정했다.

**Required spans:**

- reservation (answer), message 1, UTF-16 [0, 25): 그것은 예린에게 오후 4시까지 배정돼 있어요.
  Reason: Pronoun-subject reservation.
- antecedent (reference), message 0, UTF-16 [0, 30): 분수 옆의 번호 달린 보관함은 정원 일곱이라고 불러요.
  Reason: Identifies the pronoun subject.

**Forbidden claims:**

- 보관함 이름을 만들어낸다.
- 그것을 분수로 해석한다.

**Rationale:** Reference context is necessary even though it is in a separate message.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## en-quotation

**Question:** Who promised to return the jade whistle, and when?

**Source:**

- Message 0 · user · User: The handwritten note is signed by Farah. Its envelope has no stamp.
- Message 1 · assistant · Lina: "I will return the jade whistle on Tuesday." That is copied from the signed note, not my own promise.

**Expected answer rule:** Farah promised to return the jade whistle on Tuesday; Lina is quoting the note.

**Required spans:**

- promise (answer), message 1, UTF-16 [0, 44): "I will return the jade whistle on Tuesday."
  Reason: The promise text is quoted first person.
- signature (attribution), message 0, UTF-16 [0, 40): The handwritten note is signed by Farah.
  Reason: Identifies the quoted speaker.
- quote-status (attribution), message 1, UTF-16 [45, 101): That is copied from the signed note, not my own promise.
  Reason: Prevents assigning the quotation to the assistant.

**Forbidden claims:**

- Saying Lina or the user made the promise.
- Changing Tuesday.

**Rationale:** Quotation attribution differs from the native role of the message carrying it.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-quotation

**Question:** 산호색 호루라기를 누가 언제 돌려주겠다고 했나요?

**Source:**

- Message 0 · user · User: 손편지에는 해솔의 서명이 있어요. 봉투에는 우표가 없어요.
- Message 1 · assistant · 수빈: "제가 수요일에 산호색 호루라기를 돌려드릴게요." 이것은 서명된 편지에서 옮긴 말이며 제가 한 약속은 아니에요.

**Expected answer rule:** 해솔이 수요일에 산호색 호루라기를 돌려주겠다고 했으며 수빈은 인용했다.

**Required spans:**

- promise (answer), message 1, UTF-16 [0, 27): "제가 수요일에 산호색 호루라기를 돌려드릴게요."
  Reason: Quoted first-person promise.
- signature (attribution), message 0, UTF-16 [0, 18): 손편지에는 해솔의 서명이 있어요.
  Reason: Identifies the author of the quote.
- quote-status (attribution), message 1, UTF-16 [28, 62): 이것은 서명된 편지에서 옮긴 말이며 제가 한 약속은 아니에요.
  Reason: Distinguishes quotation author from assistant speaker.

**Forbidden claims:**

- 수빈 또는 사용자가 약속했다고 한다.
- 수요일을 바꾼다.

**Rationale:** Preserving the quote alone would lose its attribution.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## en-unknown

**Question:** What rental price did we agree for the brass sextant?

**Source:**

- Message 0 · user · User: The brass sextant is in the east cabinet. I have not asked its owner about rental terms.
- Message 1 · assistant · Lina: The cabinet key hangs beside the tide chart.

**Expected answer rule:** Abstain: no rental price has been discussed or agreed.

**Required spans:**

No known-answer spans. Evidence completeness is null; abstention needs later answer review.

**Forbidden claims:**

- Any invented price or currency.
- Treating the cabinet location as a rental agreement.

**Rationale:** No answer-bearing price span exists; empty evidence is not a successful recall score.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_

## ko-unknown

**Question:** 보라색 나침반 대여료는 얼마로 합의했죠?

**Source:**

- Message 0 · user · User: 보라색 나침반은 북쪽 진열장에 있어요. 주인에게 대여 조건은 아직 묻지 않았어요.
- Message 1 · assistant · 수빈: 진열장 열쇠는 식물 도감 옆에 걸려 있어요.

**Expected answer rule:** 대여료를 논의하거나 합의한 기록이 없으므로 모른다고 답한다.

**Required spans:**

No known-answer spans. Evidence completeness is null; abstention needs later answer review.

**Forbidden claims:**

- 금액이나 통화를 만들어낸다.
- 보관 위치를 대여 합의로 취급한다.

**Rationale:** An unknown answer is evaluated by later answer review, not vacuous source coverage.

- [ ] A human reviewed this case and recorded any corrections.

Reviewer notes: _unfilled_
