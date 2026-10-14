-- [가상 자료] 교육용 가상 쿼리입니다. 테이블·컬럼명은 실제 시스템과 무관합니다.

-- 1) 처리 전: 계약의 올해 펀드변경 횟수 확인
SELECT A.POLICY_NO
     , COUNT(*) AS CHG_CNT_YTD
  FROM TB_TEST_FUND_CHG_REQ A
 WHERE A.POLICY_NO = :POLICY_NO
   AND A.REQ_STATUS = '완료'
   AND A.REQ_DT >= TRUNC(SYSDATE, 'YYYY')
 GROUP BY A.POLICY_NO;

-- 2) 처리 전: 변경 대상 펀드의 판매 상태 확인
SELECT F.FUND_CD
     , F.FUND_NM
     , F.RISK_GRADE
     , F.SALE_STATUS
  FROM TB_TEST_FUND_MST F
 WHERE F.FUND_CD IN (:TO_FUND_CD);

-- 3) 처리 다음 날: 변경 결과 반영 확인 (계약별 펀드 구성, 비율 합계 100% 여부)
SELECT P.POLICY_NO
     , P.FUND_CD
     , P.ALLOC_RATIO
     , SUM(P.ALLOC_RATIO) OVER (PARTITION BY P.POLICY_NO) AS RATIO_SUM
  FROM TB_TEST_POLICY_FUND P
 WHERE P.POLICY_NO = :POLICY_NO
 ORDER BY P.ALLOC_RATIO DESC;
