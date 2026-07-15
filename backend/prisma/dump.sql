--
-- PostgreSQL database dump
--

\restrict 1TzZHqac9cRyXU3MIJLEtabuKLNWyYPav36lqsZfB9gxAnFgQtlEPBN1u7UG6RK

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public."Wallet" DROP CONSTRAINT IF EXISTS "Wallet_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."SignSession" DROP CONSTRAINT IF EXISTS "SignSession_walletId_fkey";
ALTER TABLE IF EXISTS ONLY public."SignSession" DROP CONSTRAINT IF EXISTS "SignSession_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."InvestmentProfile" DROP CONSTRAINT IF EXISTS "InvestmentProfile_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Collateral" DROP CONSTRAINT IF EXISTS "Collateral_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."CollateralDocument" DROP CONSTRAINT IF EXISTS "CollateralDocument_collateralId_fkey";
ALTER TABLE IF EXISTS ONLY public."BusinessProfile" DROP CONSTRAINT IF EXISTS "BusinessProfile_userId_fkey";
DROP INDEX IF EXISTS public."Wallet_userId_key";
DROP INDEX IF EXISTS public."Wallet_userId_idx";
DROP INDEX IF EXISTS public."Wallet_dfnsWalletId_key";
DROP INDEX IF EXISTS public."Wallet_dfnsWalletId_idx";
DROP INDEX IF EXISTS public."Wallet_address_key";
DROP INDEX IF EXISTS public."Wallet_address_idx";
DROP INDEX IF EXISTS public."User_username_key";
DROP INDEX IF EXISTS public."User_username_idx";
DROP INDEX IF EXISTS public."User_sumsubKybApplicantId_key";
DROP INDEX IF EXISTS public."User_sumsubApplicantId_key";
DROP INDEX IF EXISTS public."User_kycStatus_idx";
DROP INDEX IF EXISTS public."User_kybStatus_idx";
DROP INDEX IF EXISTS public."User_email_key";
DROP INDEX IF EXISTS public."User_email_idx";
DROP INDEX IF EXISTS public."User_dfnsUserId_key";
DROP INDEX IF EXISTS public."User_dfnsUserId_idx";
DROP INDEX IF EXISTS public."TransactionEvent_rwaId_idx";
DROP INDEX IF EXISTS public."TransactionEvent_investorAddress_idx";
DROP INDEX IF EXISTS public."TransactionEvent_eventType_idx";
DROP INDEX IF EXISTS public."SignSession_walletId_idx";
DROP INDEX IF EXISTS public."SignSession_userId_idx";
DROP INDEX IF EXISTS public."SignSession_status_idx";
DROP INDEX IF EXISTS public."InvestmentProfile_userId_key";
DROP INDEX IF EXISTS public."InvestmentProfile_userId_idx";
DROP INDEX IF EXISTS public."EventListenerCursor_contractId_key";
DROP INDEX IF EXISTS public."Collateral_userId_idx";
DROP INDEX IF EXISTS public."Collateral_status_idx";
DROP INDEX IF EXISTS public."Collateral_rwaId_key";
DROP INDEX IF EXISTS public."Collateral_rwaId_idx";
DROP INDEX IF EXISTS public."CollateralDocument_documentType_idx";
DROP INDEX IF EXISTS public."CollateralDocument_collateralId_idx";
DROP INDEX IF EXISTS public."BusinessProfile_userId_key";
DROP INDEX IF EXISTS public."BusinessProfile_userId_idx";
ALTER TABLE IF EXISTS ONLY public._prisma_migrations DROP CONSTRAINT IF EXISTS _prisma_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public."Wallet" DROP CONSTRAINT IF EXISTS "Wallet_pkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE IF EXISTS ONLY public."TransactionEvent" DROP CONSTRAINT IF EXISTS "TransactionEvent_pkey";
ALTER TABLE IF EXISTS ONLY public."SignSession" DROP CONSTRAINT IF EXISTS "SignSession_pkey";
ALTER TABLE IF EXISTS ONLY public."InvestmentProfile" DROP CONSTRAINT IF EXISTS "InvestmentProfile_pkey";
ALTER TABLE IF EXISTS ONLY public."EventListenerCursor" DROP CONSTRAINT IF EXISTS "EventListenerCursor_pkey";
ALTER TABLE IF EXISTS ONLY public."Collateral" DROP CONSTRAINT IF EXISTS "Collateral_pkey";
ALTER TABLE IF EXISTS ONLY public."CollateralDocument" DROP CONSTRAINT IF EXISTS "CollateralDocument_pkey";
ALTER TABLE IF EXISTS ONLY public."BusinessProfile" DROP CONSTRAINT IF EXISTS "BusinessProfile_pkey";
DROP TABLE IF EXISTS public._prisma_migrations;
DROP TABLE IF EXISTS public."Wallet";
DROP TABLE IF EXISTS public."User";
DROP TABLE IF EXISTS public."TransactionEvent";
DROP TABLE IF EXISTS public."SignSession";
DROP TABLE IF EXISTS public."InvestmentProfile";
DROP TABLE IF EXISTS public."EventListenerCursor";
DROP TABLE IF EXISTS public."CollateralDocument";
DROP TABLE IF EXISTS public."Collateral";
DROP TABLE IF EXISTS public."BusinessProfile";
DROP TYPE IF EXISTS public."UserRole";
DROP TYPE IF EXISTS public."TransactionEventType";
DROP TYPE IF EXISTS public."KycStatus";
DROP TYPE IF EXISTS public."KybStatus";
DROP TYPE IF EXISTS public."DocumentType";
DROP TYPE IF EXISTS public."CollateralStatus";
--
-- Name: CollateralStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CollateralStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'VERIFIED',
    'ON_CHAIN'
);


--
-- Name: DocumentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentType" AS ENUM (
    'COMMERCIAL_INVOICE',
    'BILL_OF_LADING',
    'PROOF_OF_DELIVERY',
    'SHIPPING_CONTRACT',
    'NOTICE_OF_ASSIGNMENT'
);


--
-- Name: KybStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."KybStatus" AS ENUM (
    'NOT_STARTED',
    'INIT',
    'PENDING',
    'COMPLETED',
    'REJECTED',
    'ON_HOLD'
);


--
-- Name: KycStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."KycStatus" AS ENUM (
    'NOT_STARTED',
    'INIT',
    'PENDING',
    'COMPLETED',
    'REJECTED',
    'ON_HOLD'
);


--
-- Name: TransactionEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TransactionEventType" AS ENUM (
    'RWA_CREATED',
    'SHARES_BOUGHT',
    'FUND_COLLECTED',
    'DEBT_SETTLED',
    'CLAIMED'
);


--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'INVESTOR',
    'SHIPPING_COMPANY'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: BusinessProfile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BusinessProfile" (
    id text NOT NULL,
    "userId" text NOT NULL,
    answers jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Collateral; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Collateral" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "rwaId" text NOT NULL,
    "tokenAddress" text,
    status public."CollateralStatus" DEFAULT 'DRAFT'::public."CollateralStatus" NOT NULL,
    "collateralData" jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: CollateralDocument; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CollateralDocument" (
    id text NOT NULL,
    "collateralId" text NOT NULL,
    "documentType" public."DocumentType" NOT NULL,
    "gcsUri" text NOT NULL,
    "gcsKey" text NOT NULL,
    "fileName" text NOT NULL,
    "mimeType" text NOT NULL,
    "fileHash" text NOT NULL,
    "fileSize" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: EventListenerCursor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventListenerCursor" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "lastLedger" integer DEFAULT 0 NOT NULL,
    "lastEventId" text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: InvestmentProfile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InvestmentProfile" (
    id text NOT NULL,
    "userId" text NOT NULL,
    answers jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: SignSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignSession" (
    id text NOT NULL,
    message text NOT NULL,
    "transactionXdr" text NOT NULL,
    status text DEFAULT 'initiated'::text NOT NULL,
    "signedXdr" text,
    "walletId" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: TransactionEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TransactionEvent" (
    id text NOT NULL,
    "rwaId" text NOT NULL,
    "eventType" public."TransactionEventType" NOT NULL,
    "investorAddress" text,
    amount text,
    "txHash" text NOT NULL,
    ledger integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    username text NOT NULL,
    "dfnsUserId" text,
    "userAuthToken" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    email text NOT NULL,
    "firstName" text,
    "lastName" text,
    "refreshTokenHash" text,
    role public."UserRole" DEFAULT 'INVESTOR'::public."UserRole" NOT NULL,
    "kycStatus" public."KycStatus" DEFAULT 'NOT_STARTED'::public."KycStatus" NOT NULL,
    "sumsubApplicantId" text,
    "sumsubExternalUserId" text,
    "companyCountry" text,
    "companyName" text,
    "companyRegistrationNumber" text,
    "kybStatus" public."KybStatus" DEFAULT 'NOT_STARTED'::public."KybStatus" NOT NULL,
    "sumsubKybApplicantId" text,
    "sumsubKybExternalUserId" text
);


--
-- Name: Wallet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Wallet" (
    id text NOT NULL,
    "dfnsWalletId" text NOT NULL,
    address text NOT NULL,
    network text NOT NULL,
    name text NOT NULL,
    "signingKeyId" text,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: BusinessProfile; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."BusinessProfile" VALUES ('cmri0apa10000kn9kclxk6290', 'usr-ol7phb69hcast65v6fwp5t9ka', '{"fleet_size": "1-5", "trade_routes": ["trans_pacific", "asia_europe", "intra_asia"], "use_of_funds": "working_capital", "business_type": "container", "annual_revenue": "under_1m"}', '2026-07-12 16:27:03.673', '2026-07-12 16:27:03.673');


--
-- Data for Name: Collateral; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: CollateralDocument; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: EventListenerCursor; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."EventListenerCursor" VALUES ('cur-dd8nm2ctsz2nern482mv6a52e', 'CBUNBDBR37C4JDBVUK6EYSLFGNFSA54JREJ7L3X3NTXGWY3OV5JTL5HI', 3619771, NULL, '2026-07-15 11:39:38.282');


--
-- Data for Name: InvestmentProfile; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: SignSession; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."SignSession" VALUES ('sgn-ec54wbq4slo6tcmz77kmyblau', 'AAAAAgAAAAAgbkDpnfjTvIqVPUJxoAjpX39nX6AoyAmOC2mAD6qTTQAAAGQAKxVOAAAAzwAAAAEAAAAAAAAAAAAAAABqU8XlAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABaNCMMd/FxIw1orxMSWUzSyB3iYkT9e77bO5rY26vUzUAAAAQY3JlYXRlX3J3YV90b2tlbgAAAAsAAAASAAAAAAAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAA4AAAAddGtuLXk1aXNmeHl0MXZiajd0aWNvNDd4enRjZmsAAAAAAAAKAAAAAAAAAAAAAAAAAAAAFAAAAAoAAAAAAAAAAAAAAAAAAAH0AAAAAwA+aOcAAAAOAAAABU1lb25nAAAAAAAADgAAAAVNRU9ORwAAAAAAAA0AAAAg2kdvACM80GXGipTfHlp6GFuPDHgU5rGFExbVrhTghfoAAAAFK2aDPs8iVhAAAAADADaCtwAAAA0AAABAMnIHaaax6G5lqcehWp2Qk+vXjy7FK9imZfU/TQ8hQ1LOCq4eHX2UVmhu8T2IIA2LcH/N2ZPbW9ElxNt2F3fHBQAAAAAAAAAAAAAAAA==', '0x0000000200000000206e40e99df8d3bc8a953d4271a008e95f7f675fa028c8098e0b69800faa934d00000064002b154e000000cf000000010000000000000000000000006a53c5e500000000000000010000000000000018000000000000000168d08c31dfc5c48c35a2bc4c4965334b2077898913f5eefb6cee6b636eaf5335000000106372656174655f7277615f746f6b656e0000000b0000001200000000000000003b1916b9f6f08cbe5e62f11d353c3c2c3bcbd52bc57673f437118eee49be6fdc0000000e0000001d746b6e2d79356973667879743176626a377469636f3437787a7463666b0000000000000a000000000000000000000000000000140000000a000000000000000000000000000001f400000003003e68e70000000e000000054d656f6e670000000000000e000000054d454f4e470000000000000d00000020da476f00233cd065c68a94df1e5a7a185b8f0c7814e6b1851316d5ae14e085fa000000052b66833ecf22561000000003003682b70000000d0000004032720769a6b1e86e65a9c7a15a9d9093ebd78f2ec52bd8a665f53f4d0f214352ce0aae1e1d7d9456686ef13d88200d8b707fcdd993db5bd125c4db761777c705000000000000000000000000', 'completed', NULL, 'wlt-wotdoatcoq89huhkze5ltwsw5', 'usr-ol7phb69hcast65v6fwp5t9ka', '2026-07-12 16:45:48.716', '2026-07-12 16:45:55.061', NULL);
INSERT INTO public."SignSession" VALUES ('sgn-ifyzdfwywg3t6zsnhokguu6n3', 'AAAAAgAAAAAgbkDpnfjTvIqVPUJxoAjpX39nX6AoyAmOC2mAD6qTTQAAAGQAKxVOAAAAzwAAAAEAAAAAAAAAAAAAAABqU8ZNAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABaNCMMd/FxIw1orxMSWUzSyB3iYkT9e77bO5rY26vUzUAAAAQY3JlYXRlX3J3YV90b2tlbgAAAAsAAAASAAAAAAAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAA4AAAAddGtuLWpudTIxNjJ6Nzl4ZWRqZXdud294d282a3IAAAAAAAAKAAAAAAAAAAAAAAAAAAAAFAAAAAoAAAAAAAAAAAAAAAAAAAH0AAAAAwA+aPwAAAAOAAAABU1lb25nAAAAAAAADgAAAAVNRU9ORwAAAAAAAA0AAAAgyMxuxtpeh22K8KTds41TEcNo11U3Xz1s4eO2gNNH60UAAAAFP8FUts9Ja/IAAAADADaCzAAAAA0AAABAa2ZzkmfxqkEkGVtdAAL6CJGsVM8uFfbgFPPNNLmFwT9m1rzzoNTnogh/WGAMi31FbAPGT80Q8Y/zqnvOm+lWCwAAAAAAAAAAAAAAAA==', '0x0000000200000000206e40e99df8d3bc8a953d4271a008e95f7f675fa028c8098e0b69800faa934d00000064002b154e000000cf000000010000000000000000000000006a53c64d00000000000000010000000000000018000000000000000168d08c31dfc5c48c35a2bc4c4965334b2077898913f5eefb6cee6b636eaf5335000000106372656174655f7277615f746f6b656e0000000b0000001200000000000000003b1916b9f6f08cbe5e62f11d353c3c2c3bcbd52bc57673f437118eee49be6fdc0000000e0000001d746b6e2d6a6e75323136327a37397865646a65776e776f78776f366b720000000000000a000000000000000000000000000000140000000a000000000000000000000000000001f400000003003e68fc0000000e000000054d656f6e670000000000000e000000054d454f4e470000000000000d00000020c8cc6ec6da5e876d8af0a4ddb38d5311c368d755375f3d6ce1e3b680d347eb45000000053fc154b6cf496bf200000003003682cc0000000d000000406b66739267f1aa4124195b5d0002fa0891ac54cf2e15f6e014f3cd34b985c13f66d6bcf3a0d4e7a2087f58600c8b7d456c03c64fcd10f18ff3aa7bce9be9560b000000000000000000000000', 'completed', NULL, 'wlt-wotdoatcoq89huhkze5ltwsw5', 'usr-ol7phb69hcast65v6fwp5t9ka', '2026-07-12 16:47:33.124', '2026-07-12 16:47:37.169', NULL);
INSERT INTO public."SignSession" VALUES ('sgn-xk20swcwukes9l30857e5q4cg', 'AAAAAgAAAAAgbkDpnfjTvIqVPUJxoAjpX39nX6AoyAmOC2mAD6qTTQAAAGQAKxVOAAAAzwAAAAEAAAAAAAAAAAAAAABqU8aIAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABaNCMMd/FxIw1orxMSWUzSyB3iYkT9e77bO5rY26vUzUAAAAQY3JlYXRlX3J3YV90b2tlbgAAAAsAAAASAAAAAAAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAA4AAAAddGtuLW4waDBwZXp0MTJ5czNvbnl6cGVtbWFnNmoAAAAAAAAKAAAAAAAAAAAAAAAAAAAAFAAAAAoAAAAAAAAAAAAAAAAAAAH0AAAAAwA+aQgAAAAOAAAABU1lb25nAAAAAAAADgAAAAVNRU9ORwAAAAAAAA0AAAAgd+ByPmC0vcRgIgYpLwK1KJPKWQrGSra2XWanadAXFksAAAAFsjlDmURK+ZEAAAADADaC2AAAAA0AAABAn91Y+KHJql860QRERlZp7UnvK4TtZgCNjMPflEzMcLl6c4/Rbz7J3NH9Pl2xY3WE2QLzPowgtuJWhwi41A4fAgAAAAAAAAAAAAAAAA==', '0x0000000200000000206e40e99df8d3bc8a953d4271a008e95f7f675fa028c8098e0b69800faa934d00000064002b154e000000cf000000010000000000000000000000006a53c68800000000000000010000000000000018000000000000000168d08c31dfc5c48c35a2bc4c4965334b2077898913f5eefb6cee6b636eaf5335000000106372656174655f7277615f746f6b656e0000000b0000001200000000000000003b1916b9f6f08cbe5e62f11d353c3c2c3bcbd52bc57673f437118eee49be6fdc0000000e0000001d746b6e2d6e30683070657a7431327973336f6e797a70656d6d6167366a0000000000000a000000000000000000000000000000140000000a000000000000000000000000000001f400000003003e69080000000e000000054d656f6e670000000000000e000000054d454f4e470000000000000d0000002077e0723e60b4bdc4602206292f02b52893ca590ac64ab6b65d66a769d017164b00000005b2394399444af99100000003003682d80000000d000000409fdd58f8a1c9aa5f3ad10444465669ed49ef2b84ed66008d8cc3df944ccc70b97a738fd16f3ec9dcd1fd3e5db1637584d902f33e8c20b6e2568708b8d40e1f02000000000000000000000000', 'completed', 'AAAAAgAAAAAgbkDpnfjTvIqVPUJxoAjpX39nX6AoyAmOC2mAD6qTTQAAAGQAKxVOAAAAzwAAAAEAAAAAAAAAAAAAAABqU8aIAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABaNCMMd/FxIw1orxMSWUzSyB3iYkT9e77bO5rY26vUzUAAAAQY3JlYXRlX3J3YV90b2tlbgAAAAsAAAASAAAAAAAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAA4AAAAddGtuLW4waDBwZXp0MTJ5czNvbnl6cGVtbWFnNmoAAAAAAAAKAAAAAAAAAAAAAAAAAAAAFAAAAAoAAAAAAAAAAAAAAAAAAAH0AAAAAwA+aQgAAAAOAAAABU1lb25nAAAAAAAADgAAAAVNRU9ORwAAAAAAAA0AAAAgd+ByPmC0vcRgIgYpLwK1KJPKWQrGSra2XWanadAXFksAAAAFsjlDmURK+ZEAAAADADaC2AAAAA0AAABAn91Y+KHJql860QRERlZp7UnvK4TtZgCNjMPflEzMcLl6c4/Rbz7J3NH9Pl2xY3WE2QLzPowgtuJWhwi41A4fAgAAAAAAAAAAAAAAAUm+b9wAAABAuzXPS24HGGmXFoPAnNIbVjyWlt3CpajsY6x4/0EySjZpCaIHvVwzXQeQGMyCxA6cey8NDH5l2LBbEugN+Dp+Cg==', 'wlt-wotdoatcoq89huhkze5ltwsw5', 'usr-ol7phb69hcast65v6fwp5t9ka', '2026-07-12 16:48:31.562', '2026-07-12 16:48:35.484', NULL);
INSERT INTO public."SignSession" VALUES ('sgn-ticwffnx2iemnv7zxl2yq5vmq', 'AAAAAgAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAGQANn38AAAAAgAAAAEAAAAAAAAAAAAAAABqU8erAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABaNCMMd/FxIw1orxMSWUzSyB3iYkT9e77bO5rY26vUzUAAAAQY3JlYXRlX3J3YV90b2tlbgAAAAsAAAASAAAAAAAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAA4AAAAddGtuLXc2b3Rncm9qZDE2M2Jqc2YwMmhqbnIwZDgAAAAAAAAKAAAAAAAAAAAAAAAAAAAAFAAAAAoAAAAAAAAAAAAAAAAAAAH0AAAAAwA+aUIAAAAOAAAABU1lb25nAAAAAAAADgAAAAVNRU9ORwAAAAAAAA0AAAAgjTsDoe2PxBZ93L5drJ8pMAoKcc8AJf/m1O899lIJfNYAAAAFLbBSH+Az2IwAAAADADaDEgAAAA0AAABAA363AotmvQ3NX0xuCe5xN2Ucz1HSbt1e2TZ3mKwld7l9XXw0bdE51QVX3QFQt+9ybwlGKQmd1Dn4Cb1cJV9RCQAAAAAAAAAAAAAAAA==', '0x00000002000000003b1916b9f6f08cbe5e62f11d353c3c2c3bcbd52bc57673f437118eee49be6fdc0000006400367dfc00000002000000010000000000000000000000006a53c7ab00000000000000010000000000000018000000000000000168d08c31dfc5c48c35a2bc4c4965334b2077898913f5eefb6cee6b636eaf5335000000106372656174655f7277615f746f6b656e0000000b0000001200000000000000003b1916b9f6f08cbe5e62f11d353c3c2c3bcbd52bc57673f437118eee49be6fdc0000000e0000001d746b6e2d77366f7467726f6a64313633626a73663032686a6e723064380000000000000a000000000000000000000000000000140000000a000000000000000000000000000001f400000003003e69420000000e000000054d656f6e670000000000000e000000054d454f4e470000000000000d000000208d3b03a1ed8fc4167ddcbe5dac9f29300a0a71cf0025ffe6d4ef3df652097cd6000000052db0521fe033d88c00000003003683120000000d00000040037eb7028b66bd0dcd5f4c6e09ee7137651ccf51d26edd5ed9367798ac2577b97d5d7c346dd139d50557dd0150b7ef726f094629099dd439f809bd5c255f5109000000000000000000000000', 'completed', 'AAAAAgAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAGQANn38AAAAAgAAAAEAAAAAAAAAAAAAAABqU8erAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABaNCMMd/FxIw1orxMSWUzSyB3iYkT9e77bO5rY26vUzUAAAAQY3JlYXRlX3J3YV90b2tlbgAAAAsAAAASAAAAAAAAAAA7GRa59vCMvl5i8R01PDwsO8vVK8V2c/Q3EY7uSb5v3AAAAA4AAAAddGtuLXc2b3Rncm9qZDE2M2Jqc2YwMmhqbnIwZDgAAAAAAAAKAAAAAAAAAAAAAAAAAAAAFAAAAAoAAAAAAAAAAAAAAAAAAAH0AAAAAwA+aUIAAAAOAAAABU1lb25nAAAAAAAADgAAAAVNRU9ORwAAAAAAAA0AAAAgjTsDoe2PxBZ93L5drJ8pMAoKcc8AJf/m1O899lIJfNYAAAAFLbBSH+Az2IwAAAADADaDEgAAAA0AAABAA363AotmvQ3NX0xuCe5xN2Ucz1HSbt1e2TZ3mKwld7l9XXw0bdE51QVX3QFQt+9ybwlGKQmd1Dn4Cb1cJV9RCQAAAAAAAAAAAAAAAUm+b9wAAABAZReueET5y6gGJzk3tFmGH+E5jFcRpWwqSmWG5ihsaDfAXkvlMzAX28dd+yFKuMhuS4XEjQrv9VsVMhe0nC/FBg==', 'wlt-wotdoatcoq89huhkze5ltwsw5', 'usr-ol7phb69hcast65v6fwp5t9ka', '2026-07-12 16:53:23.19', '2026-07-12 16:53:26.524', NULL);


--
-- Data for Name: TransactionEvent; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."User" VALUES ('usr-isnrmn7iupj5m8jvw9gzi3ak6', 'wildan@tokenminds.co', 'us-01jtb-imrht-edl9flkevj8gev5j', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJpc3MiOiJhdXRoLmRmbnMuaW8iLCJhdWQiOiJkZm5zOmF1dGg6dXNlciIsInN1YiI6Im9yLTAxanN1LWpvZGluLWVvanJpZjQwYmU5bW44ZmgiLCJqdGkiOiJ1ai0wMWp0Yi1pb2FzbC1lbGc4b3RwZW5uNmczYW5qIiwiaHR0cHM6Ly9jdXN0b20vdXNlcm5hbWUiOiJ3aWxkYW5AdG9rZW5taW5kcy5jbyIsImh0dHBzOi8vY3VzdG9tL2FwcF9tZXRhZGF0YSI6eyJ0b2tlbktpbmQiOiJUb2tlbiIsInVzZXJJZCI6InVzLTAxanRiLWltcmh0LWVkbDlmbGtldmo4Z2V2NWoiLCJvcmdJZCI6Im9yLTAxanN1LWpvZGluLWVvanJpZjQwYmU5bW44ZmgifSwiaWF0IjoxNzgzODczOTQwLCJleHAiOjE3ODM4OTU1NDB9.Qo3xN9jVMiLjJyLspFnIN2i6p5UvPGNXElk_49q0x0oV_QlmE18U_7tLKbTZAFMMPR8ox6ZTHIhjLx4QGVekBg', '2026-07-12 16:31:30.481', '2026-07-12 16:32:20.407', NULL, 'wildan@tokenminds.co', 'Wildan', 'Azmi', 'f8b4484d80dbc75ae1a625474271f67b33cbaa64a0894bd982b77b8800d38e97', 'INVESTOR', 'NOT_STARTED', NULL, NULL, NULL, NULL, NULL, 'NOT_STARTED', NULL, NULL);
INSERT INTO public."User" VALUES ('usr-ol7phb69hcast65v6fwp5t9ka', 'danzrrr@tokenminds.co', 'us-01jtb-h5b31-eckagom4qhpnojj2', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJpc3MiOiJhdXRoLmRmbnMuaW8iLCJhdWQiOiJkZm5zOmF1dGg6dXNlciIsInN1YiI6Im9yLTAxanN1LWpvZGluLWVvanJpZjQwYmU5bW44ZmgiLCJqdGkiOiJ1ai0wMWp0Yi1qOWdwcC1laGhwbmZ0MWpuZ2I2ZTNiIiwiaHR0cHM6Ly9jdXN0b20vdXNlcm5hbWUiOiJkYW56cnJyQHRva2VubWluZHMuY28iLCJodHRwczovL2N1c3RvbS9hcHBfbWV0YWRhdGEiOnsidG9rZW5LaW5kIjoiVG9rZW4iLCJ1c2VySWQiOiJ1cy0wMWp0Yi1oNWIzMS1lY2thZ29tNHFocG5vamoyIiwib3JnSWQiOiJvci0wMWpzdS1qb2Rpbi1lb2pyaWY0MGJlOW1uOGZoIn0sImlhdCI6MTc4Mzg3NDUwMywiZXhwIjoxNzgzODk2MTAzfQ.3BcHNkmyrNBUbx6KpxVuCE5elUxSL5rMFwruFgn2isepmpyisqyug595-1ZdnjPUiTJ7K_A-RFoCo21Zahx-BQ', '2026-07-12 16:04:28.311', '2026-07-12 16:41:43.576', NULL, 'danzrrr@tokenminds.co', 'Wildan', 'Danzrrr', '0e8b052f03545b1c8c76e72c22685777926d2a87066badd51c7ba951c475810e', 'SHIPPING_COMPANY', 'NOT_STARTED', NULL, NULL, NULL, NULL, NULL, 'COMPLETED', '6a53c05b3f455f67ab5536b2', 'usr-ol7phb69hcast65v6fwp5t9ka:kyb');


--
-- Data for Name: Wallet; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public."Wallet" VALUES ('wlt-wotdoatcoq89huhkze5ltwsw5', 'wa-01jtb-h5gpr-ehoqmm896ge58l1m', 'GA5RSFVZ63YIZPS6MLYR2NJ4HQWDXS6VFPCXM47UG4IY53SJXZX5YLBR', 'StellarTestnet', 'danzrrr@tokenminds.co-stellar', 'key-01jtb-h5gdt-eporenao4a97vt1f', 'usr-ol7phb69hcast65v6fwp5t9ka', '2026-07-12 16:04:35.349', '2026-07-12 16:04:35.349', NULL);
INSERT INTO public."Wallet" VALUES ('wlt-dr52bmrc2d4g8xdo0dkpgzj6t', 'wa-01jtb-intjf-emd9ok896jhapcri', 'GDZ3TSDKR2P25CYXJMBXSV4ABCNHBPSPSNQAHW6Y6PDCH353CQJNVCDG', 'StellarTestnet', 'wildan@tokenminds.co-stellar', 'key-01jtb-int6p-eiupjggragi2mepa', 'usr-isnrmn7iupj5m8jvw9gzi3ak6', '2026-07-12 16:32:06.88', '2026-07-12 16:32:06.88', NULL);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public._prisma_migrations VALUES ('4ab4b042-54f4-4a21-92e3-58f3ab54dd87', 'd8f17584fd961b4168bc7205ae750a19636baff878f947c8dc5470bb80f1f5da', '2026-07-12 16:04:18.7472+00', '20260707181634_init', NULL, NULL, '2026-07-12 16:04:18.71359+00', 1);
INSERT INTO public._prisma_migrations VALUES ('1f3c1c27-9c88-4f69-8db3-2c726e9c5a19', '0592a82068cc9ec039e686710c66037ce899fc45fcba8acb52f5ef8bf3c14bb9', '2026-07-12 16:04:18.752308+00', '20260708120000_add_auth_fields', NULL, NULL, '2026-07-12 16:04:18.747779+00', 1);
INSERT INTO public._prisma_migrations VALUES ('a7240836-eb73-475f-876a-5d5473fe2769', '3a36e92ed30a19147aa7a2fee4a428f171800e4eb330a37b845c1e4d61617af3', '2026-07-12 16:04:18.756109+00', '20260708130000_add_user_role', NULL, NULL, '2026-07-12 16:04:18.752895+00', 1);
INSERT INTO public._prisma_migrations VALUES ('d7d1f10f-e5cf-4190-92c0-19a17ba10245', '41d63e410cfbfb3c35bf5f5901ed2d5479d8bb87c40cad17d287471fa39bc87f', '2026-07-12 16:04:18.760941+00', '20260708140000_add_kyc_fields', NULL, NULL, '2026-07-12 16:04:18.756672+00', 1);
INSERT INTO public._prisma_migrations VALUES ('d1d4ef12-c9d8-4a49-8d1b-1a6c354f16cc', 'cccf02bd61a36e95b18f514f78d1e0232954bb5856bc37a887da8a7497a8828c', '2026-07-12 16:04:18.7659+00', '20260710174103_add_investment_profile', NULL, NULL, '2026-07-12 16:04:18.761492+00', 1);
INSERT INTO public._prisma_migrations VALUES ('6d2b502d-758e-435b-8b3c-9e1f52564c5e', 'da157e6f15e1864a805161484bf8bb2a7c56bf75ebbbc48ddd43fc9f73e1d269', '2026-07-12 16:04:18.770596+00', '20260710183058_add_kyb_fields', NULL, NULL, '2026-07-12 16:04:18.766455+00', 1);
INSERT INTO public._prisma_migrations VALUES ('89da935d-151c-49b8-8941-df2729df623a', '19adb8fad19b9080573213486d78c425cd7eac52a86b6d191dbcd246f073176a', '2026-07-12 16:04:18.775873+00', '20260711043220_add_business_profile', NULL, NULL, '2026-07-12 16:04:18.771196+00', 1);
INSERT INTO public._prisma_migrations VALUES ('998718a0-4998-4929-93ba-7c7a5510904a', '4cdc291454db33690f163873b8313e425665e7c05c1449e517b911cf2c80b3ce', '2026-07-12 16:04:18.793022+00', '20260712143128_add_collateral_and_events', NULL, NULL, '2026-07-12 16:04:18.77647+00', 1);


--
-- Name: BusinessProfile BusinessProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY (id);


--
-- Name: CollateralDocument CollateralDocument_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CollateralDocument"
    ADD CONSTRAINT "CollateralDocument_pkey" PRIMARY KEY (id);


--
-- Name: Collateral Collateral_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Collateral"
    ADD CONSTRAINT "Collateral_pkey" PRIMARY KEY (id);


--
-- Name: EventListenerCursor EventListenerCursor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventListenerCursor"
    ADD CONSTRAINT "EventListenerCursor_pkey" PRIMARY KEY (id);


--
-- Name: InvestmentProfile InvestmentProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvestmentProfile"
    ADD CONSTRAINT "InvestmentProfile_pkey" PRIMARY KEY (id);


--
-- Name: SignSession SignSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignSession"
    ADD CONSTRAINT "SignSession_pkey" PRIMARY KEY (id);


--
-- Name: TransactionEvent TransactionEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransactionEvent"
    ADD CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Wallet Wallet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: BusinessProfile_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BusinessProfile_userId_idx" ON public."BusinessProfile" USING btree ("userId");


--
-- Name: BusinessProfile_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BusinessProfile_userId_key" ON public."BusinessProfile" USING btree ("userId");


--
-- Name: CollateralDocument_collateralId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CollateralDocument_collateralId_idx" ON public."CollateralDocument" USING btree ("collateralId");


--
-- Name: CollateralDocument_documentType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CollateralDocument_documentType_idx" ON public."CollateralDocument" USING btree ("documentType");


--
-- Name: Collateral_rwaId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Collateral_rwaId_idx" ON public."Collateral" USING btree ("rwaId");


--
-- Name: Collateral_rwaId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Collateral_rwaId_key" ON public."Collateral" USING btree ("rwaId");


--
-- Name: Collateral_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Collateral_status_idx" ON public."Collateral" USING btree (status);


--
-- Name: Collateral_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Collateral_userId_idx" ON public."Collateral" USING btree ("userId");


--
-- Name: EventListenerCursor_contractId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventListenerCursor_contractId_key" ON public."EventListenerCursor" USING btree ("contractId");


--
-- Name: InvestmentProfile_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InvestmentProfile_userId_idx" ON public."InvestmentProfile" USING btree ("userId");


--
-- Name: InvestmentProfile_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InvestmentProfile_userId_key" ON public."InvestmentProfile" USING btree ("userId");


--
-- Name: SignSession_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignSession_status_idx" ON public."SignSession" USING btree (status);


--
-- Name: SignSession_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignSession_userId_idx" ON public."SignSession" USING btree ("userId");


--
-- Name: SignSession_walletId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignSession_walletId_idx" ON public."SignSession" USING btree ("walletId");


--
-- Name: TransactionEvent_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransactionEvent_eventType_idx" ON public."TransactionEvent" USING btree ("eventType");


--
-- Name: TransactionEvent_investorAddress_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransactionEvent_investorAddress_idx" ON public."TransactionEvent" USING btree ("investorAddress");


--
-- Name: TransactionEvent_rwaId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransactionEvent_rwaId_idx" ON public."TransactionEvent" USING btree ("rwaId");


--
-- Name: User_dfnsUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_dfnsUserId_idx" ON public."User" USING btree ("dfnsUserId");


--
-- Name: User_dfnsUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_dfnsUserId_key" ON public."User" USING btree ("dfnsUserId");


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_kybStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_kybStatus_idx" ON public."User" USING btree ("kybStatus");


--
-- Name: User_kycStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_kycStatus_idx" ON public."User" USING btree ("kycStatus");


--
-- Name: User_sumsubApplicantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_sumsubApplicantId_key" ON public."User" USING btree ("sumsubApplicantId");


--
-- Name: User_sumsubKybApplicantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_sumsubKybApplicantId_key" ON public."User" USING btree ("sumsubKybApplicantId");


--
-- Name: User_username_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_username_idx" ON public."User" USING btree (username);


--
-- Name: User_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username);


--
-- Name: Wallet_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Wallet_address_idx" ON public."Wallet" USING btree (address);


--
-- Name: Wallet_address_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Wallet_address_key" ON public."Wallet" USING btree (address);


--
-- Name: Wallet_dfnsWalletId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Wallet_dfnsWalletId_idx" ON public."Wallet" USING btree ("dfnsWalletId");


--
-- Name: Wallet_dfnsWalletId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Wallet_dfnsWalletId_key" ON public."Wallet" USING btree ("dfnsWalletId");


--
-- Name: Wallet_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Wallet_userId_idx" ON public."Wallet" USING btree ("userId");


--
-- Name: Wallet_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Wallet_userId_key" ON public."Wallet" USING btree ("userId");


--
-- Name: BusinessProfile BusinessProfile_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CollateralDocument CollateralDocument_collateralId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CollateralDocument"
    ADD CONSTRAINT "CollateralDocument_collateralId_fkey" FOREIGN KEY ("collateralId") REFERENCES public."Collateral"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Collateral Collateral_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Collateral"
    ADD CONSTRAINT "Collateral_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InvestmentProfile InvestmentProfile_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvestmentProfile"
    ADD CONSTRAINT "InvestmentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SignSession SignSession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignSession"
    ADD CONSTRAINT "SignSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SignSession SignSession_walletId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignSession"
    ADD CONSTRAINT "SignSession_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES public."Wallet"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Wallet Wallet_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 1TzZHqac9cRyXU3MIJLEtabuKLNWyYPav36lqsZfB9gxAnFgQtlEPBN1u7UG6RK

