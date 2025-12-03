# VidShare (The Truman Platform)

**VidShare** is a video-based social media simulation platform built with **The Truman Platform** (see below for more info). In VidShare, users perceive they are participating in a real social media platform similar to YouTube Shorts and TikTok. The platform is fully immersive and allows users to interact with video content and other user comments.

Named after the 1998 film, The Truman Show, **The Truman Platform** is an open-source, complete social media simulation platform. It was developed as part of a joint effort by the [Cornell Social Media Lab (SML)](https://socialmedialab.cornell.edu/), led by former SML post-doc [Dominic DiFranzo](https://difranzo.com/), to provide researchers a community research infrastructure to conduct social media experiments in ecologically-valid realistic environments. Researchers can create different social media environments with a repertoire of features and affordances that fit their research goals and purposes, while ensuring participants have a naturalistic social media experience.

This current iteration studies the **effect of online community members behavior on audiences behavior, perception, and future behavioral intentions**.

## Experimental Design

The study uses a **three-phase design**:

1. **Tutorial Phase (Videos 1)**: Users experience experimental conditions

   - **Video 1**: Shows harassment with assigned experimental condition (Control, AI Removal, Human Objection, etc.)

2. **Behavioral Phase (Videos 2-3)**: Users can freely interact with the platform, no harassmant
   - **Videos 2-3**: Users can interact with normally (like, reply, flag, etc.)

## Experimental Conditions

Change the query parameter of the URL to be directed to the different experimental conditions:

| Query parameter | Definition                           | Values                                                                                                            |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| c_id            | Indicates the experimental condition | None, Rem:AI:NoRef, Rem:AI:Ref, Obj:AI:NoRef, Obj:AI:Ref, Rem:Com:NoRef, Rem:Com:Ref., Obj:Com:NoRef, Obj:Com:Ref |
|                 |

- **Control**: No moderation applied to harassment
- **AI_Removal_NoRef**: AI removes harassment (no community reference)
- **AI_Removal_Community**: AI removes harassment (with community reference)
- **Community_Removal_NoRef**: Community removes harassment (no community reference)
- **Community_Removal_Community**: Community removes harassment (with community reference)
- **AI_Objection_NoRef**: AI adds objection comment (no community reference)
- **AI_Objection_Community**: AI adds objection comment (with community reference)
- **Human_Objection_NoRef**: Human adds objection comment (no community reference)
- **Human_Objection_Community**: Human adds objection comment (with community reference)

### **Demo:**

Coming soon.

### **Publications:**

Coming soon.
