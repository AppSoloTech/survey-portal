import { useEffect, useState, type FormEvent } from "react";
import type { CurrentUserProfileResponse } from "@survey-portal/shared";

import {
  fetchCurrentUserProfile,
  requestCurrentUserPasswordReset,
  updateCurrentUserProfile
} from "../api/auth.js";
import { useAuth } from "../auth/AuthContext.js";
import { useReveal } from "../motion/motion.js";

const emptyProfileForm = {
  organization: "",
  jobTitle: "",
  location: ""
};

export function AccountSettings() {
  const { user } = useAuth();
  const revealRef = useReveal<HTMLElement>();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<CurrentUserProfileResponse["profile"] | null>(null);
  const [surveyStats, setSurveyStats] =
    useState<CurrentUserProfileResponse["surveyStats"] | null>(null);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isCoolingDown = cooldownSeconds > 0;

  useEffect(() => {
    let isActive = true;

    fetchCurrentUserProfile()
      .then((response) => {
        if (!isActive) {
          return;
        }

        setProfile(response.profile);
        setSurveyStats(response.surveyStats);
        setProfileForm({
          organization: response.profile.organization ?? "",
          jobTitle: response.profile.jobTitle ?? "",
          location: response.profile.location ?? ""
        });
      })
      .catch((loadError) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load profile");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isCoolingDown) {
      return undefined;
    }

    const cooldownTimer = window.setTimeout(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => {
      window.clearTimeout(cooldownTimer);
    };
  }, [isCoolingDown, cooldownSeconds]);

  async function handleRequestReset() {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await requestCurrentUserPasswordReset();
      setMessage(response.message);
      setCooldownSeconds(30);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsProfileSaving(true);

    try {
      const savedProfile = await updateCurrentUserProfile(profileForm);
      setProfile(savedProfile);
      setProfileForm({
        organization: savedProfile.organization ?? "",
        jobTitle: savedProfile.jobTitle ?? "",
        location: savedProfile.location ?? ""
      });
      setMessage("Profile saved.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Profile save failed");
    } finally {
      setIsProfileSaving(false);
    }
  }

  return (
    <section className="page settings-page" ref={revealRef}>
      <div className="page-header" data-reveal>
        <p className="eyebrow">Account</p>
        <h2>Settings</h2>
        <p>Review your account details and request a password reset email.</p>
      </div>

      <div className="settings-layout" data-reveal>
        <section className="profile-panel">
          <h3>Account details</h3>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>
                {user?.firstName} {user?.lastName}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user?.role === "admin" ? "Admin" : "User"}</dd>
            </div>
          </dl>
        </section>

        <section className="profile-panel">
          <h3>Survey stats</h3>
          {isProfileLoading ? <p className="status muted">Loading profile...</p> : null}
          {surveyStats ? (
            <div className="settings-stats-grid">
              <StatTile label="Available" value={surveyStats.available} />
              <StatTile label="In progress" value={surveyStats.inProgress} />
              <StatTile label="Completed" value={surveyStats.completed} />
              <StatTile label="Completion rate" value={`${surveyStats.completionRate}%`} />
              <div className="settings-stat-tile wide">
                <span>Last activity</span>
                <strong>{formatActivityDate(surveyStats.lastActivityAt)}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <form className="profile-panel profile-form" onSubmit={handleSaveProfile}>
          <div>
            <h3>Profile</h3>
            <p>Optional demographic details for your account.</p>
          </div>
          <label>
            <span>Organization or department</span>
            <input
              maxLength={120}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, organization: event.target.value }))
              }
              type="text"
              value={profileForm.organization}
            />
          </label>
          <label>
            <span>Job title or role</span>
            <input
              maxLength={120}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, jobTitle: event.target.value }))
              }
              type="text"
              value={profileForm.jobTitle}
            />
          </label>
          <label>
            <span>Location or region</span>
            <input
              maxLength={120}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, location: event.target.value }))
              }
              type="text"
              value={profileForm.location}
            />
          </label>
          <button
            className="button-link compact-button primary-button"
            disabled={isProfileSaving || isProfileLoading}
            type="submit"
          >
            {isProfileSaving ? "Saving..." : "Save profile"}
          </button>
          {profile?.updatedAt ? (
            <p className="settings-meta">Updated {formatActivityDate(profile.updatedAt)}</p>
          ) : null}
        </form>

        <section className="profile-panel">
          <div className="settings-action">
            <div>
              <h3>Password reset</h3>
              <p>A reset link will be sent to your account email.</p>
            </div>
            <button
              className="button-link compact-button primary-button"
              disabled={isSubmitting || isCoolingDown}
              onClick={handleRequestReset}
              type="button"
            >
              {getResetButtonLabel({ isSubmitting, cooldownSeconds })}
            </button>
          </div>
        </section>
      </div>

      {message ? <p className="status success">{message}</p> : null}
      {error ? <p className="status error">{error}</p> : null}
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="settings-stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatActivityDate(value: string | null): string {
  if (!value) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getResetButtonLabel({
  isSubmitting,
  cooldownSeconds
}: {
  isSubmitting: boolean;
  cooldownSeconds: number;
}): string {
  if (isSubmitting) {
    return "Sending...";
  }

  if (cooldownSeconds > 0) {
    return `Sent (${cooldownSeconds}s)`;
  }

  return "Send reset link";
}
