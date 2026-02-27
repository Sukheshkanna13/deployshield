-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "embedding" vector(12) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);
