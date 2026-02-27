-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "prometheusUrl" TEXT,
    "slackWebhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentSession" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "commitSha" TEXT,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "maxRiskScore" DOUBLE PRECISION,

    CONSTRAINT "DeploymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rate" DOUBLE PRECISION NOT NULL,
    "errorRate" DOUBLE PRECISION NOT NULL,
    "p99" DOUBLE PRECISION NOT NULL,
    "saturation" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_apiKey_key" ON "Project"("apiKey");

-- AddForeignKey
ALTER TABLE "DeploymentSession" ADD CONSTRAINT "DeploymentSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DeploymentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
