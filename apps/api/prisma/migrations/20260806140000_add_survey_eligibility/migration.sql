-- CreateTable
CREATE TABLE "SurveyEligibility" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyEligibility_survey_id_developer_id_key" ON "SurveyEligibility"("survey_id", "developer_id");

-- CreateIndex
CREATE INDEX "SurveyEligibility_survey_id_idx" ON "SurveyEligibility"("survey_id");

-- CreateIndex
CREATE INDEX "SurveyEligibility_developer_id_idx" ON "SurveyEligibility"("developer_id");

-- AddForeignKey
ALTER TABLE "SurveyEligibility" ADD CONSTRAINT "SurveyEligibility_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyEligibility" ADD CONSTRAINT "SurveyEligibility_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
