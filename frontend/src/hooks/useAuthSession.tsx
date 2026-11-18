import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateFirebaseDisplayName,
  type User as FirebaseUser,
} from 'firebase/auth';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import type {
  BusinessOperationalSettingsDTO,
  BusinessProfileDTO,
  CreateBusinessRequestDTO,
  PersonalProfileDTO,
  SessionContextResponseDTO,
  TenantMembershipContext,
  UpdateBusinessProfileRequestDTO,
  UpdateBusinessSettingsRequestDTO,
  UpdatePersonalProfileRequestDTO,
} from '@flotech/shared';
import {
  getActiveAppCheckToken,
  getFirebaseClientAuth,
  getFirebaseClientStorage,
  isFirebaseClientConfigured,
} from '@/config/firebaseClient';
import {
  createNewBusinessTenant,
  fetchAuthenticatedPersonalProfile,
  fetchTenantBusinessContext,
  provisionBackendUserSession,
  updateAuthenticatedPersonalProfile,
  updateTenantBusinessProfileApi,
  updateTenantBusinessSettingsApi,
} from '@/services/apiClient';

export interface AuthSessionContextValue {
  isFirebaseConfigured: boolean;
  isLoadingAuth: boolean;
  firebaseUser: FirebaseUser | null;
  profile: PersonalProfileDTO | null;
  memberships: SessionContextResponseDTO['memberships'];
  activeBusinessId: string | null;
  activeBusinessProfile: BusinessProfileDTO | null;
  activeTenantMembership: TenantMembershipContext | null;
  authError: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (params: {
    email: string;
    password: string;
    fullName: string;
    phoneNumber?: string;
  }) => Promise<void>;
  signOutSession: () => Promise<void>;
  /** Sends a Firebase password reset email (Firebase-hosted reset flow). */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Re-sends the Firebase email verification link to the signed-in user. */
  resendEmailVerification: () => Promise<void>;
  refreshProfileSession: () => Promise<void>;
  savePersonalProfileUpdates: (updates: UpdatePersonalProfileRequestDTO) => Promise<void>;
  uploadPersonalAvatar: (file: File) => Promise<string>;
  // Phase 3 Business Tenant Actions
  selectActiveBusiness: (businessId: string) => Promise<void>;
  createBusiness: (payload: CreateBusinessRequestDTO) => Promise<BusinessProfileDTO>;
  saveBusinessProfileUpdates: (updates: UpdateBusinessProfileRequestDTO) => Promise<void>;
  saveBusinessSettingsUpdates: (updates: UpdateBusinessSettingsRequestDTO) => Promise<void>;
  uploadBusinessLogo: (file: File) => Promise<string>;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
const ACTIVE_BUSINESS_STORAGE_KEY = 'flotech_active_business_id';

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseClientConfigured();
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(configured);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<PersonalProfileDTO | null>(null);
  const [memberships, setMemberships] = useState<SessionContextResponseDTO['memberships']>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY) : null
  );
  const [activeBusinessProfile, setActiveBusinessProfile] = useState<BusinessProfileDTO | null>(
    null
  );
  const [activeTenantMembership, setActiveTenantMembership] =
    useState<TenantMembershipContext | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadBusinessContext = useCallback(
    async (user: FirebaseUser, businessId: string) => {
      const idToken = await user.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await fetchTenantBusinessContext(idToken, appCheckToken, businessId);
      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }
      setActiveBusinessId(businessId);
      setActiveBusinessProfile(res.data.business);
      setActiveTenantMembership(res.data.membership);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, businessId);
      }
    },
    []
  );

  const syncWithBackend = useCallback(
    async (
      user: FirebaseUser,
      provisionMetadata?: { fullName?: string; phoneNumber?: string }
    ) => {
      const idToken = await user.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await provisionBackendUserSession(idToken, appCheckToken, {
        fullName: provisionMetadata?.fullName,
        phoneNumber: provisionMetadata?.phoneNumber ?? null,
      });

      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }

      setProfile(res.data.profile);
      setMemberships(res.data.memberships);

      const activeMemberships = res.data.memberships.filter((m) => m.status === 'ACTIVE');
      const storedId =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)
          : null;
      const targetMembership =
        activeMemberships.find((m) => m.businessId === storedId) ?? activeMemberships[0];

      if (targetMembership) {
        await loadBusinessContext(user, targetMembership.businessId);
      } else {
        setActiveBusinessId(null);
        setActiveBusinessProfile(null);
        setActiveTenantMembership(null);
      }
    },
    [loadBusinessContext]
  );

  useEffect(() => {
    if (!configured) {
      setIsLoadingAuth(false);
      return;
    }

    const auth = getFirebaseClientAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setMemberships([]);
        setActiveBusinessId(null);
        setActiveBusinessProfile(null);
        setActiveTenantMembership(null);
        setIsLoadingAuth(false);
        return;
      }

      try {
        setAuthError(null);
        await syncWithBackend(user);
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Failed to synchronize session with PostgreSQL.'
        );
      } finally {
        setIsLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [configured, syncWithBackend]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      setIsLoadingAuth(true);
      try {
        const auth = getFirebaseClientAuth();
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        await syncWithBackend(credential.user);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed.';
        setAuthError(message);
        throw err;
      } finally {
        setIsLoadingAuth(false);
      }
    },
    [syncWithBackend]
  );

  const registerWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      fullName: string;
      phoneNumber?: string;
    }) => {
      setAuthError(null);
      setIsLoadingAuth(true);
      try {
        const auth = getFirebaseClientAuth();
        const credential = await createUserWithEmailAndPassword(
          auth,
          params.email.trim(),
          params.password
        );
        await updateFirebaseDisplayName(credential.user, {
          displayName: params.fullName.trim(),
        });
        // Send verification email immediately after registration.
        await sendEmailVerification(credential.user);
        await syncWithBackend(credential.user, {
          fullName: params.fullName.trim(),
          phoneNumber: params.phoneNumber?.trim(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed.';
        setAuthError(message);
        throw err;
      } finally {
        setIsLoadingAuth(false);
      }
    },
    [syncWithBackend]
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(getFirebaseClientAuth(), email.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password reset request failed.';
      setAuthError(message);
      throw err;
    }
  }, []);

  const resendEmailVerification = useCallback(async () => {
    setAuthError(null);
    const current = getFirebaseClientAuth().currentUser;
    if (!current) {
      throw new Error('You must be signed in to resend the verification email.');
    }
    await sendEmailVerification(current);
  }, []);

  const signOutSession = useCallback(async () => {
    setAuthError(null);
    if (configured) {
      const auth = getFirebaseClientAuth();
      await firebaseSignOut(auth);
    }
    setFirebaseUser(null);
    setProfile(null);
    setMemberships([]);
    setActiveBusinessId(null);
    setActiveBusinessProfile(null);
    setActiveTenantMembership(null);
  }, [configured]);

  const refreshProfileSession = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }
    const idToken = await firebaseUser.getIdToken();
    const appCheckToken = await getActiveAppCheckToken();
    const res = await fetchAuthenticatedPersonalProfile(idToken, appCheckToken);
    if (!res.success) {
      throw new Error(`${res.error.code}: ${res.error.message}`);
    }
    setProfile(res.data.profile);
    setMemberships(res.data.memberships);
    if (activeBusinessId) {
      await loadBusinessContext(firebaseUser, activeBusinessId);
    }
  }, [firebaseUser, activeBusinessId, loadBusinessContext]);

  const savePersonalProfileUpdates = useCallback(
    async (updates: UpdatePersonalProfileRequestDTO) => {
      if (!firebaseUser) {
        throw new Error('You must be signed in to update your personal profile.');
      }
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await updateAuthenticatedPersonalProfile(idToken, appCheckToken, updates);
      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }
      setProfile(res.data);
    },
    [firebaseUser]
  );

  const uploadPersonalAvatar = useCallback(
    async (file: File): Promise<string> => {
      if (!firebaseUser) {
        throw new Error('You must be signed in to upload an avatar.');
      }
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `avatars/${firebaseUser.uid}/${Date.now()}_${sanitizedName}`;
      const storage = getFirebaseClientStorage();
      const objectRef = storageRef(storage, storagePath);
      await uploadBytes(objectRef, file, { contentType: file.type });

      await savePersonalProfileUpdates({ avatarStoragePath: storagePath });
      return storagePath;
    },
    [firebaseUser, savePersonalProfileUpdates]
  );

  const selectActiveBusiness = useCallback(
    async (businessId: string) => {
      if (!firebaseUser) {
        throw new Error('You must be signed in to switch businesses.');
      }
      await loadBusinessContext(firebaseUser, businessId);
    },
    [firebaseUser, loadBusinessContext]
  );

  const createBusiness = useCallback(
    async (payload: CreateBusinessRequestDTO): Promise<BusinessProfileDTO> => {
      if (!firebaseUser) {
        throw new Error('You must be signed in to create a business.');
      }
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await createNewBusinessTenant(idToken, appCheckToken, payload);
      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }

      // Refresh user memberships and set the newly created business as active
      await refreshProfileSession();
      setActiveBusinessId(res.data.business.id);
      setActiveBusinessProfile(res.data.business);
      setActiveTenantMembership(res.data.membership);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, res.data.business.id);
      }

      return res.data.business;
    },
    [firebaseUser, refreshProfileSession]
  );

  const saveBusinessProfileUpdates = useCallback(
    async (updates: UpdateBusinessProfileRequestDTO) => {
      if (!firebaseUser || !activeBusinessId) {
        throw new Error('An active business context is required to update the business profile.');
      }
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await updateTenantBusinessProfileApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        updates
      );
      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }
      setActiveBusinessProfile(res.data);
      await refreshProfileSession();
    },
    [firebaseUser, activeBusinessId, refreshProfileSession]
  );

  const saveBusinessSettingsUpdates = useCallback(
    async (updates: UpdateBusinessSettingsRequestDTO) => {
      if (!firebaseUser || !activeBusinessId) {
        throw new Error('An active business context is required to update operational settings.');
      }
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await updateTenantBusinessSettingsApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        updates
      );
      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }
      setActiveBusinessProfile((prev: BusinessProfileDTO | null) =>
        prev
          ? {
              ...prev,
              settings: res.data as BusinessOperationalSettingsDTO,
            }
          : null
      );
    },
    [firebaseUser, activeBusinessId]
  );

  const uploadBusinessLogo = useCallback(
    async (file: File): Promise<string> => {
      if (!firebaseUser || !activeBusinessId) {
        throw new Error('An active business context is required to upload a business logo.');
      }
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `businesses/${activeBusinessId}/branding/${Date.now()}_${sanitizedName}`;
      const storage = getFirebaseClientStorage();
      const objectRef = storageRef(storage, storagePath);
      await uploadBytes(objectRef, file, { contentType: file.type });

      await saveBusinessProfileUpdates({ logoStoragePath: storagePath });
      return storagePath;
    },
    [firebaseUser, activeBusinessId, saveBusinessProfileUpdates]
  );

  return (
    <AuthSessionContext.Provider
      value={{
        isFirebaseConfigured: configured,
        isLoadingAuth,
        firebaseUser,
        profile,
        memberships,
        activeBusinessId,
        activeBusinessProfile,
        activeTenantMembership,
        authError,
        signInWithEmail,
        registerWithEmail,
        signOutSession,
        sendPasswordReset,
        resendEmailVerification,
        refreshProfileSession,
        savePersonalProfileUpdates,
        uploadPersonalAvatar,
        selectActiveBusiness,
        createBusiness,
        saveBusinessProfileUpdates,
        saveBusinessSettingsUpdates,
        uploadBusinessLogo,
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within an AuthSessionProvider.');
  }
  return ctx;
}
