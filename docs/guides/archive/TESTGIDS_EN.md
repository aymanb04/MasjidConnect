# MasjidConnect — Test Guide

Thank you for helping test! This guide walks you through the platform step by step.
Follow the checklist for **your role** (administrator, teacher or student), tick off
what works, and note anything that feels off — small things included.

## Before you start

- Go to **masjidconnect.be** and sign in with the credentials you received.
- On your first sign-in you'll be asked to accept the terms — that's expected.
- Test on **both your computer and your phone**. On your phone you can install the
  app: open the site in your browser and choose **"Add to Home Screen"** /
  **"Install"** — MasjidConnect then opens like a real app.
- Forgot your password? Use "Forgot password" on the sign-in page — feel free to test that too.

## How to give feedback

In the bottom-right corner of every page there's a **green button with a speech
bubble**. Click it, pick **Bug** (something's broken), **Suggestie** (idea) or
**Vraag** (question), type your message and send. It goes straight to the developer.

When reporting a problem, always note: **which page**, **what you did**, **what you
expected** and **what actually happened**. A screenshot helps a lot.

---

## Checklist — Administrator (board)

**User management** (Beheer)
- [ ] Invite a test user (Beheer → Gebruiker toevoegen, choose role Leerling and a group). Expected: the person receives an email and, after signing in, is automatically enrolled in all subjects of that group.
- [ ] Archive that same test user, then reactivate them. Expected: archived = can no longer sign in; after reactivating they can again.
- [ ] Look at the CSV import (Beheer → Importeren). Feel free to try a small test file with 2–3 made-up students.

**Structure** (Klassen)
- [ ] Create a test class/subject in an existing group and assign a teacher. Expected: the teacher sees the class appear immediately.
- [ ] Open **Beheer → Jaarovergang** (year transition) and look through the wizard. **Don't run it** — just check whether everything is clear.

**Communication**
- [ ] Post an announcement for the **whole school**, then one for **a single group**. Expected: students of other groups don't see the second one.
- [ ] Post an announcement **for teachers only**. Expected: students never see it.

**Schedule** (Rooster)
- [ ] Add a lesson slot (day, time, room). Expected: it appears in the schedule and agenda of that class.

**Attendance** (Aanwezigheid)
- [ ] Open a student's year overview. Expected: all presences/absences and statistics are visible.
- [ ] Check the dashboard for alerts about unmarked days or students absent multiple times in a row.

**Report cards** (Rapporten)
- [ ] Generate a report card for one student (Rapporten → generate, pick a semester). Expected: the grades are pre-filled from the gradebook.
- [ ] Adjust a grade and a comment, then **publish** the report. Expected: only after publishing can the student see it.
- [ ] Open the published report and print it (or save as PDF). Expected: a clean bilingual layout (Arabic/Dutch) with signature lines.

**Student files** (Dossiers)
- [ ] Open a student's file, complete the contact details and add a note.
- [ ] Link two students (siblings) to the same family.
- [ ] Upload a test document for a student. Expected: it opens via a secure link.

**Payments** (Betalingen)
- [ ] Set the amounts for membership (lidgeld) and chart for this school year.
- [ ] Register a membership payment for a student and a chart payment for a family. Expected: for the family, one payment covers all the children together.
- [ ] Set an hourly rate for a teacher and log hours for a month. Expected: the amount is calculated automatically.

**Parent-teacher meetings** (Oudercontact)
- [ ] View the time slots and book a slot **on behalf of a parent**. Expected: the slot then shows as full (with capacity 1).

## Checklist — Teacher

- [ ] Sign in and look at the dashboard. Expected: your own classes, announcements and attention points.
- [ ] Create a homework assignment (title, deadline, max score). Expected: your students see it immediately under Huiswerk.
- [ ] Grade a submitted assignment: give a score and a comment. Expected: the student sees score + comment.
- [ ] Create a lesson module and upload a document into it (e.g. a PDF). Expected: students can download it.
- [ ] Take today's attendance: everyone defaults to present; set one student to absent and one to late.
- [ ] Fill in a **forgotten day** (pick a date in the past).
- [ ] Open the gradebook and add a **test column** (e.g. "Test chapter 1, out of 20"). Enter a few scores. Expected: the average updates immediately.
- [ ] Enter an **exam score** for a student (per semester).
- [ ] Open a draft report card and fill in **your own subject**: grade + comment. Expected: you **cannot** edit a colleague's subject, and you **cannot** publish (only the administrator can).
- [ ] Open time slots for the parent-teacher meeting. Expected: bookings appear on your side.
- [ ] Open the file of a student you teach and add a note.
- [ ] Post an announcement for one of your classes.

## Checklist — Student

- [ ] Sign in and look at the dashboard. Expected: your schedule, announcements and open homework.
- [ ] Open a homework assignment and submit: type an answer and/or upload a file. Expected: status becomes "submitted"; you can still edit until it's graded.
- [ ] After grading, check your score and the teacher's comment.
- [ ] Open **Mijn punten** (via your class → Punten). Expected: all your scores and your average — yours only.
- [ ] Download a document from a lesson module.
- [ ] Check your schedule and agenda. Expected: only your own lessons.
- [ ] Open your **published report card** and print / save as PDF.
- [ ] Book a time slot for the parent-teacher meeting.
- [ ] Check the menu: you should see **no** Betalingen, **no** Dossiers and **no** Beheer.

---

## Extra: test on your phone

- [ ] Scroll through a long page. Expected: smooth, nothing "sticks", buttons don't stay pressed after a tap.
- [ ] Rotate your phone to landscape. Expected: the app adapts cleanly, nothing disappears behind the edge of the screen.
- [ ] Open a dialog (e.g. submitting homework) and try scrolling behind it. Expected: the page behind it doesn't move.
- [ ] Install the app on your home screen and open it from there. Expected: opens as a full app, without a browser bar.

## What we're especially curious about

1. Is it clear everywhere **what you're supposed to do**, without prior explanation?
2. Is anything missing that you currently handle on paper or via WhatsApp?
3. Does anything feel **slow**? Note which page and when (evening, many users…).
4. Are all texts correct? (typos, odd phrasing — do report them)

Thank you for your time — every remark makes the platform better!
