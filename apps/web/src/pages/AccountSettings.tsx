import { useEffect, useState, type FormEvent } from "react";
import type { CurrentUserProfileResponse } from "@survey-portal/shared";
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";

import {
  fetchCurrentUserProfile,
  requestCurrentUserPasswordReset,
  updateCurrentUserProfile
} from "../api/auth.js";
import { useAuth } from "../auth/AuthContext.js";
import { AlertMessage } from "../components/AlertMessage.js";
import { FormField } from "../components/FormField.js";
import { useReveal } from "../motion/motion.js";

const emptyProfileForm = {
  firstName: "",
  lastName: "",
  contactNumber: "",
  addressStreet: "",
  addressCity: "",
  addressState: ""
};

export function AccountSettings() {
  const { updateSessionUser, user } = useAuth();
  const revealRef = useReveal<HTMLElement>();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<CurrentUserProfileResponse["profile"] | null>(null);
  const [surveyStats, setSurveyStats] =
    useState<CurrentUserProfileResponse["surveyStats"] | null>(null);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [contactNumberError, setContactNumberError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isCoolingDown = cooldownSeconds > 0;
  const resetCooldownDescriptionId = "password-reset-cooldown-description";

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
          firstName: response.user.firstName,
          lastName: response.user.lastName,
          contactNumber: response.profile.contactNumber ?? "",
          addressStreet: response.profile.addressStreet ?? "",
          addressCity: response.profile.addressCity ?? "",
          addressState: response.profile.addressState ?? ""
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
    if (isCoolingDown || isSubmitting) {
      return;
    }

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
    setContactNumberError(null);

    if (profileForm.contactNumber && !isPossiblePhoneNumber(profileForm.contactNumber)) {
      setContactNumberError("Phone number must be a valid phone number");
      return;
    }

    setIsProfileSaving(true);

    try {
      const response = await updateCurrentUserProfile(profileForm);
      setProfile(response.profile);
      updateSessionUser(response.user);
      setProfileForm({
        firstName: response.user.firstName,
        lastName: response.user.lastName,
        contactNumber: response.profile.contactNumber ?? "",
        addressStreet: response.profile.addressStreet ?? "",
        addressCity: response.profile.addressCity ?? "",
        addressState: response.profile.addressState ?? ""
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
        <h1>Settings</h1>
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
          {isProfileLoading ? (
            <AlertMessage variant="info">Loading profile...</AlertMessage>
          ) : null}
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
            <h3>Profile details</h3>
            <p>Update your name and optional contact details.</p>
          </div>
          <FormField id="profile-first-name" isRequired label="First name">
            {(fieldProps) => (
              <input
                {...fieldProps}
                maxLength={120}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, firstName: event.target.value }))
                }
                required
                type="text"
                value={profileForm.firstName}
              />
            )}
          </FormField>
          <FormField id="profile-last-name" isRequired label="Last name">
            {(fieldProps) => (
              <input
                {...fieldProps}
                maxLength={120}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, lastName: event.target.value }))
                }
                required
                type="text"
                value={profileForm.lastName}
              />
            )}
          </FormField>
          <FormField id="profile-address-street" isOptional label="Street address">
            {(fieldProps) => (
              <input
                {...fieldProps}
                maxLength={160}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    addressStreet: event.target.value
                  }))
                }
                type="text"
                value={profileForm.addressStreet}
              />
            )}
          </FormField>
          <FormField id="profile-address-city" isOptional label="City">
            {(fieldProps) => (
              <input
                {...fieldProps}
                maxLength={80}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, addressCity: event.target.value }))
                }
                type="text"
                value={profileForm.addressCity}
              />
            )}
          </FormField>
          <FormField id="profile-address-state" isOptional label="State">
            {(fieldProps) => (
              <input
                {...fieldProps}
                maxLength={80}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, addressState: event.target.value }))
                }
                type="text"
                value={profileForm.addressState}
              />
            )}
          </FormField>
          <FormField
            error={contactNumberError}
            helperText="Use an international format if outside the US."
            id="profile-phone-number"
            isOptional
            label="Phone number"
          >
            {(fieldProps) => (
              <PhoneInput
                {...fieldProps}
                className="profile-phone-input"
                defaultCountry="US"
                international
                countryCallingCodeEditable={false}
                onChange={(value) => {
                  setContactNumberError(null);
                  setProfileForm((current) => ({ ...current, contactNumber: value ?? "" }));
                }}
                placeholder="Enter phone number"
                value={profileForm.contactNumber}
              />
            )}
          </FormField>
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
              aria-describedby={isCoolingDown ? resetCooldownDescriptionId : undefined}
              aria-disabled={isCoolingDown ? true : undefined}
              className="button-link compact-button primary-button"
              disabled={isSubmitting}
              onClick={handleRequestReset}
              type="button"
            >
              {getResetButtonLabel({ isSubmitting, cooldownSeconds })}
            </button>
            {isCoolingDown ? (
              <p className="form-note align-right" id={resetCooldownDescriptionId}>
                A reset email was just requested. You can request another in {cooldownSeconds}{" "}
                seconds.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {message ? <AlertMessage variant="success">{message}</AlertMessage> : null}
      {error ? <AlertMessage variant="error">{error}</AlertMessage> : null}
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
