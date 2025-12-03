VidShare (The Truman Platform)
=======================

**VidShare** is a video-based social media simulation platform built with **The Truman Platform** (see below for more info). In VidShare, users perceive they are participating in a real social media platform similar to YouTube Shorts and TikTok. The platform is fully immersive and allows users to interact with video content and other user comments.

Named after the 1998 film, The Truman Show, **The Truman Platform** is an open-source, complete social media simulation platform. It was developed as part of a joint effort by the [Cornell Social Media Lab (SML)](https://socialmedialab.cornell.edu/), led by former SML post-doc [Dominic DiFranzo](https://difranzo.com/), to provide researchers a community research infrastructure to conduct social media experiments in ecologically-valid realistic environments. Researchers can create different social media environments with a repertoire of features and affordances that fit their research goals and purposes, while ensuring participants have a naturalistic social media experience. 

This current iteration studies the **effect of online community members behavior on audiences behavior, perception, and future behavioral intentions**. 

## Experimental Design

The study uses a **three-phase design**:

1. **Tutorial Phase (Videos 1-6)**: Users experience experimental conditions
   - **Video 1**: Shows harassment with assigned experimental condition (Control, AI Removal, Human Objection, etc.)
   - **Videos 2-6**: Buffer videos with normal content (no harassment)

2. **Behavioral Phase (Videos 7-9)**: Users can freely interact with harassment
   - **Videos 7-9**: Contain harassment that users can interact with normally (like, reply, flag, etc.)
   - This measures the **effect** of the experimental condition on user behavior

## Experimental Conditions

Change the query parameter of the URL to be directed to the different experimental conditions:

| Query parameter  | Definition | Values |
| ------------- | ------------- | ------ |
| c_id  | Indicates the experimental condition | Control, AI_Removal_NoRef, AI_Removal_Community, Human_Objection_NoRef, Human_Objection_Community |

- **Control**: No moderation applied to harassment
- **AI_Removal_NoRef**: AI removes harassment (no community reference)
- **AI_Removal_Community**: AI removes harassment (with community reference)
- **Human_Objection_NoRef**: Human adds objection comment (no community reference)
- **Human_Objection_Community**: Human adds objection comment (with community reference)

### **Demo:** 
Coming soon.

### **Publications:** 
Coming soon.
