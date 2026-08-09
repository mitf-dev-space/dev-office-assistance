-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('draft', 'published', 'closed', 'archived');

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SurveyStatus" NOT NULL DEFAULT 'draft',
    "closes_at" TIMESTAMP(3),
    "show_results_after_close" BOOLEAN NOT NULL DEFAULT false,
    "min_responses_to_show" INTEGER NOT NULL DEFAULT 5,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyInvitation" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousSurveyResponse" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousSurveyAnswer" (
    "id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AnonymousSurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Survey_status_createdAt_idx" ON "Survey"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Survey_created_by_id_idx" ON "Survey"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyQuestion_survey_id_position_key" ON "SurveyQuestion"("survey_id", "position");

-- CreateIndex
CREATE INDEX "SurveyQuestion_survey_id_idx" ON "SurveyQuestion"("survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyInvitation_token_hash_key" ON "SurveyInvitation"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyInvitation_survey_id_developer_id_key" ON "SurveyInvitation"("survey_id", "developer_id");

-- CreateIndex
CREATE INDEX "SurveyInvitation_survey_id_idx" ON "SurveyInvitation"("survey_id");

-- CreateIndex
CREATE INDEX "SurveyInvitation_developer_id_idx" ON "SurveyInvitation"("developer_id");

-- CreateIndex
CREATE INDEX "SurveyInvitation_used_idx" ON "SurveyInvitation"("used");

-- CreateIndex
CREATE INDEX "AnonymousSurveyResponse_survey_id_idx" ON "AnonymousSurveyResponse"("survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousSurveyAnswer_response_id_question_id_key" ON "AnonymousSurveyAnswer"("response_id", "question_id");

-- CreateIndex
CREATE INDEX "AnonymousSurveyAnswer_question_id_idx" ON "AnonymousSurveyAnswer"("question_id");

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyInvitation" ADD CONSTRAINT "SurveyInvitation_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyInvitation" ADD CONSTRAINT "SurveyInvitation_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonymousSurveyResponse" ADD CONSTRAINT "AnonymousSurveyResponse_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonymousSurveyAnswer" ADD CONSTRAINT "AnonymousSurveyAnswer_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "AnonymousSurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonymousSurveyAnswer" ADD CONSTRAINT "AnonymousSurveyAnswer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
